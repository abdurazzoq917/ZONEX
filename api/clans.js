// api/clans.js
// ============================================================
// KLANLAR (TEAM)
//
//   GET  /api/clans?id=<men>            — ro'yxat + o'z klanim
//   GET  /api/clans?id=<men>&clan=<id>  — bitta klan
//
//   POST /api/clans { id, action, ... }
//
//     "create" { name, tag, about, color, open }
//     "join"   { clanId }   — ochiq klanga kirish / so'rov
//     "accept" { target }   — so'rovni qabul qilish (ega)
//     "decline"{ target }   — rad etish (ega)
//     "kick"   { target }   — chiqarib yuborish (ega)
//     "leave"  {}           — o'zi chiqish
//     "update" { about, color, open }  — sozlash (ega)
//     "delete" {}           — klanni yopish (ega)
//
// Klan ochish uchun kamida 3-daraja kerak — bo'sh klanlar
// to'lib ketmasin.
// ============================================================

const { json, preflight, readBody } = require("./_http");
const { locked } = require("./_lock");

const {
  readPlayers,
  writePlayers,
  readClans,
  writeClans,
  isBanned,
  banInfo,
  clans,
  notify
} = require("./_store");

const { guard } = require("./_auth");

// O'yinchining klan haqidagi ma'lumotini yozuviga yozamiz
function attach(player, clan) {
  player.clanId = clan ? clan.id : "";
}

async function handler(req, res) {
  if (preflight(req, res)) return;

  try {
    const players = await readPlayers();

    const list = await readClans();

    // ---------------------------------------------------------
    // O'QISH
    // ---------------------------------------------------------

    if (req.method === "GET") {
      const params = new URLSearchParams(req.url.split("?")[1] || "");

      const id = String(params.get("id") || "").trim();

      const check = guard(players, id, req, null);

      if (!check.ok) {
        return json(res, check.status, {
          error: check.error,
          message: check.message
        });
      }

      const me = check.player;

      const wanted = String(params.get("clan") || "").trim();

      if (wanted) {
        const clan = clans.clanById(list, wanted);

        if (!clan) return json(res, 404, { error: "Klan topilmadi" });

        return json(res, 200, {
          ok: true,
          clan: clans.clanView(clan, players, id),
          time: Date.now()
        });
      }

      const mine = clans.clanOf(list, id);

      return json(res, 200, {
        ok: true,

        mine: mine ? clans.clanView(mine, players, id) : null,

        board: clans.clanBoard(list, players),

        minLevel: clans.MIN_LEVEL,
        maxMembers: clans.MAX_MEMBERS,
        colors: clans.COLORS,

        canCreate: !mine && Number(me.level) >= clans.MIN_LEVEL,
        level: Number(me.level) || 1,

        time: Date.now()
      });
    }

    if (req.method !== "POST") {
      return json(res, 405, { error: "Faqat GET yoki POST" });
    }

    // ---------------------------------------------------------
    // O'ZGARTIRISH
    // ---------------------------------------------------------

    const body = await readBody(req);

    const id = String(body.id || "").trim();
    const action = String(body.action || "").trim();

    if (!id) return json(res, 400, { error: "ID kerak" });

    const check = guard(players, id, req, body);

    if (!check.ok) {
      return json(res, check.status, {
        error: check.error,
        message: check.message
      });
    }

    const me = check.player;

    if (isBanned(me)) {
      return json(res, 403, {
        error: "banned",
        message: "Siz banlangansiz",
        ban: banInfo(me)
      });
    }

    const mine = clans.clanOf(list, id);

    const done = async (clan, message, changedPlayers) => {
      await writeClans(list);

      if (changedPlayers && changedPlayers.length) {
        await writePlayers(changedPlayers);
      }

      return json(res, 200, {
        ok: true,
        message,
        mine: clan ? clans.clanView(clan, players, id) : null,
        board: clans.clanBoard(list, players),
        time: Date.now()
      });
    };

    switch (action) {
      // -----------------------------------------------------
      case "create": {
        if (mine) {
          return json(res, 400, {
            error: "in_clan",
            message: "Avval hozirgi klaningizdan chiqing"
          });
        }

        if (Number(me.level) < clans.MIN_LEVEL) {
          return json(res, 403, {
            error: "low_level",
            message:
              "Klan ochish uchun " + clans.MIN_LEVEL + "-daraja kerak"
          });
        }

        const nameBad = clans.nameError(body.name);

        if (nameBad) return json(res, 400, { error: "bad_name", message: nameBad });

        const tagBad = clans.tagError(body.tag);

        if (tagBad) return json(res, 400, { error: "bad_tag", message: tagBad });

        if (clans.nameTaken(list, body.name)) {
          return json(res, 400, {
            error: "name_taken",
            message: "Bunday nomli klan bor"
          });
        }

        if (clans.tagTaken(list, body.tag)) {
          return json(res, 400, {
            error: "tag_taken",
            message: "Bunday qisqartma band"
          });
        }

        const clan = clans.normalizeClan({
          id: clans.makeClanId(),
          name: body.name,
          tag: body.tag,
          about: body.about,
          color: body.color,
          open: body.open !== false,
          ownerId: id,
          members: [id],
          createdAt: Date.now()
        });

        list.push(clan);

        attach(me, clan);

        return done(clan, "«" + clan.name + "» klani ochildi", [me]);
      }

      // -----------------------------------------------------
      case "join": {
        if (mine) {
          return json(res, 400, {
            error: "in_clan",
            message: "Siz allaqachon klandasiz"
          });
        }

        const clan = clans.clanById(list, body.clanId);

        if (!clan) return json(res, 404, { error: "Klan topilmadi" });

        if (clan.members.length >= clans.MAX_MEMBERS) {
          return json(res, 400, {
            error: "full",
            message: "Klan to'lgan (" + clans.MAX_MEMBERS + " a'zo)"
          });
        }

        // Ochiq klanga darhol kiradi, yopiqqa so'rov yuboradi
        if (clan.open) {
          clan.members.push(id);

          attach(me, clan);

          const owner = players[clan.ownerId];

          if (owner) {
            notify.notify(owner, {
              type: "clan",
              from: id,
              fromName: me.name,
              title: "Klanga yangi a'zo",
              body: "@" + me.name + " «" + clan.name + "» ga qo'shildi"
            });
          }

          return done(
            clan,
            "«" + clan.name + "» klaniga qo'shildingiz",
            owner ? [me, owner] : [me]
          );
        }

        if (clan.requests.includes(id)) {
          return json(res, 200, {
            ok: true,
            message: "So'rovingiz allaqachon yuborilgan"
          });
        }

        clan.requests.push(id);

        const owner = players[clan.ownerId];

        if (owner) {
          notify.notify(owner, {
            type: "clan",
            from: id,
            fromName: me.name,
            title: "Klanga so'rov",
            body: "@" + me.name + " «" + clan.name + "» ga kirmoqchi"
          });
        }

        await writeClans(list);

        if (owner) await writePlayers([owner]);

        return json(res, 200, {
          ok: true,
          message: "So'rov yuborildi — klan egasi tasdiqlaydi",
          time: Date.now()
        });
      }

      // -----------------------------------------------------
      case "accept":
      case "decline": {
        if (!mine || mine.ownerId !== id) {
          return json(res, 403, {
            error: "not_owner",
            message: "Bu amal faqat klan egasiga"
          });
        }

        const target = String(body.target || "");

        if (!mine.requests.includes(target)) {
          return json(res, 400, { error: "no_request" });
        }

        mine.requests = mine.requests.filter((item) => item !== target);

        const member = players[target];

        if (action === "decline" || !member) {
          return done(mine, "So'rov rad etildi", member ? [member] : []);
        }

        if (mine.members.length >= clans.MAX_MEMBERS) {
          return json(res, 400, { error: "full", message: "Klan to'lgan" });
        }

        mine.members.push(target);

        attach(member, mine);

        notify.notify(member, {
          type: "clan",
          title: "Klanga qabul qilindingiz",
          body: "«" + mine.name + "» endi sizning klaningiz"
        });

        return done(mine, "@" + member.name + " klanga qo'shildi", [member]);
      }

      // -----------------------------------------------------
      case "kick": {
        if (!mine || mine.ownerId !== id) {
          return json(res, 403, {
            error: "not_owner",
            message: "Bu amal faqat klan egasiga"
          });
        }

        const target = String(body.target || "");

        if (target === id) {
          return json(res, 400, {
            error: "self",
            message: "Egani chiqarib bo'lmaydi — klanni yoping"
          });
        }

        mine.members = mine.members.filter((item) => item !== target);

        const member = players[target];

        if (member) {
          attach(member, null);

          notify.notify(member, {
            type: "clan",
            title: "Klandan chiqarildingiz",
            body: "«" + mine.name + "» klanidan chiqarildingiz"
          });
        }

        return done(mine, "A'zo chiqarildi", member ? [member] : []);
      }

      // -----------------------------------------------------
      case "leave": {
        if (!mine) {
          return json(res, 400, { error: "no_clan", message: "Klaningiz yo'q" });
        }

        // Ega chiqsa — klan boshqasiga o'tadi yoki yopiladi
        if (mine.ownerId === id) {
          const next = mine.members.find((item) => item !== id);

          if (!next) {
            const index = list.findIndex((clan) => clan.id === mine.id);

            if (index >= 0) list.splice(index, 1);

            attach(me, null);

            return done(null, "Klan yopildi", [me]);
          }

          mine.ownerId = next;
        }

        mine.members = mine.members.filter((item) => item !== id);

        attach(me, null);

        return done(null, "Klandan chiqdingiz", [me]);
      }

      // -----------------------------------------------------
      case "update": {
        if (!mine || mine.ownerId !== id) {
          return json(res, 403, {
            error: "not_owner",
            message: "Bu amal faqat klan egasiga"
          });
        }

        if (body.about != null) mine.about = clans.tidy(body.about, 120);

        if (body.color && clans.COLORS.includes(String(body.color))) {
          mine.color = String(body.color);
        }

        if (body.open != null) mine.open = Boolean(body.open);

        return done(mine, "Klan sozlamalari saqlandi", []);
      }

      // -----------------------------------------------------
      case "delete": {
        if (!mine || mine.ownerId !== id) {
          return json(res, 403, {
            error: "not_owner",
            message: "Bu amal faqat klan egasiga"
          });
        }

        const members = mine.members
          .map((item) => players[item])
          .filter(Boolean);

        members.forEach((member) => attach(member, null));

        const index = list.findIndex((clan) => clan.id === mine.id);

        if (index >= 0) list.splice(index, 1);

        return done(null, "Klan yopildi", members);
      }

      // -----------------------------------------------------
      default:
        return json(res, 400, { error: "Noma'lum amal" });
    }
  } catch (error) {
    console.error("CLANS API XATOSI:", error);

    return json(res, (error && error.status) || 500, {
      error: error && error.status ? error.message : "Serverda xatolik",
      message: error && error.message
    });
  }
}

module.exports = locked("players", handler);

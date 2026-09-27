import { getStore } from "@netlify/blobs";

const PEOPLE = ["kasem", "moussa"];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}

function tomorrowIso() {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  t.setDate(t.getDate() + 1);
  return t.toISOString().slice(0, 10);
}

export default async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/?/, "");
  const pinsStore = getStore("pins");
  const checkinsStore = getStore("checkins");
  const settingsStore = getStore("settings");

  try {
    if (req.method === "GET" && path === "checkins") {
      const { blobs } = await checkinsStore.list();
      const result = {};
      for (const b of blobs) {
        const data = await checkinsStore.get(b.key, { type: "json" });
        if (data) result[b.key] = data;
      }
      return json({ checkins: result });
    }

    if (req.method === "GET" && path === "settings") {
      let data = await settingsStore.get("config", { type: "json" });
      if (!data) {
        data = { startDate: tomorrowIso(), penaltyAmount: 5 };
        await settingsStore.setJSON("config", data);
      }
      return json({ settings: data });
    }

    if (req.method === "POST" && path === "settings") {
      const body = await req.json();
      const startDate = String(body.startDate || "");
      const penaltyAmount = Number(body.penaltyAmount);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return json({ ok: false, error: "bad start date" }, 400);
      if (!(penaltyAmount >= 0)) return json({ ok: false, error: "bad penalty amount" }, 400);
      const data = { startDate, penaltyAmount, updatedAt: new Date().toISOString() };
      await settingsStore.setJSON("config", data);
      return json({ ok: true, settings: data });
    }

    if (req.method === "POST" && path === "login") {
      const body = await req.json();
      const name = String(body.name || "").toLowerCase();
      const pin = String(body.pin || "");
      if (!PEOPLE.includes(name)) return json({ ok: false, error: "unknown name" }, 400);
      if (!/^\d{4}$/.test(pin)) return json({ ok: false, error: "pin must be 4 digits" }, 400);

      const existing = await pinsStore.get(name, { type: "json" });
      if (!existing) {
        await pinsStore.setJSON(name, { pin, setAt: new Date().toISOString() });
        return json({ ok: true, created: true });
      }
      if (existing.pin !== pin) return json({ ok: false, error: "wrong pin" }, 401);
      return json({ ok: true, created: false });
    }

    if (req.method === "POST" && path === "checkin") {
      const body = await req.json();
      const name = String(body.name || "").toLowerCase();
      const pin = String(body.pin || "");
      const date = String(body.date || "");
      if (!PEOPLE.includes(name)) return json({ ok: false, error: "unknown name" }, 400);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ ok: false, error: "bad date" }, 400);

      const existingPin = await pinsStore.get(name, { type: "json" });
      if (!existingPin || existingPin.pin !== pin) return json({ ok: false, error: "unauthorized" }, 401);

      const rec = (await checkinsStore.get(date, { type: "json" })) || { date };
      const checked = body.checked === false ? false : true;
      rec[name] = checked;
      rec[name + "Time"] = checked ? new Date().toISOString() : null;
      await checkinsStore.setJSON(date, rec);
      return json({ ok: true, checkin: rec });
    }

    return json({ error: "not found" }, 404);
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, 500);
  }
};

export const config = { path: "/api/*" };

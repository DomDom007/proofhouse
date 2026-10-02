// Proofhouse: film one walk through your home, pull out still frames, and turn them into an itemised inventory for insurance.
import { useEffect, useState } from "react";
import { toCsv } from "./lib/csv";
import { idbDel, idbGet, idbSet, shrinkImage } from "./lib/idb";
import { moneyFmt } from "./lib/money";
import { download, uid, useStored } from "./lib/store";
import { CurrencySelect, Section, Stat, Stats } from "./ui/kit";

const T = "proofhouse";
type Item = { id: string; room: string; name: string; category: string; value: number; year: number; serial: string; photo: boolean };
const ROOMS = ["Living room", "Kitchen", "Bedroom", "Office", "Bathroom", "Garage", "Other"];
const CATS: Record<string, number> = { Electronics: 5, Furniture: 10, Appliances: 8, Jewellery: 0, Clothing: 4, Art: 0, Tools: 10, Other: 7 }; // useful life in years, 0 = holds value
const SAMPLE: Item[] = [
  { id: "i1", room: "Living room", name: "Samsung 55\" TV", category: "Electronics", value: 2100, year: 2023, serial: "QE55Q70C-XX1234", photo: false },
  { id: "i2", room: "Living room", name: "Corner sofa", category: "Furniture", value: 3400, year: 2021, serial: "", photo: false },
  { id: "i3", room: "Kitchen", name: "Fridge freezer", category: "Appliances", value: 2600, year: 2022, serial: "RB38T-889210", photo: false },
  { id: "i4", room: "Bedroom", name: "Gold bracelet", category: "Jewellery", value: 4200, year: 2019, serial: "", photo: false },
  { id: "i5", room: "Office", name: "MacBook Air", category: "Electronics", value: 4800, year: 2024, serial: "C02XK1ABCD12", photo: false },
];

function Thumb({ id, onClick }: { id: string; onClick?: () => void }) {
  const [src, setSrc] = useState("");
  useEffect(() => { idbGet(`${T}:${id}`).then(v => setSrc(v ?? "")); }, [id]);
  return src ? <img src={src} alt="" className="ph-thumb" onClick={onClick} /> : <div className="ph-thumb ph-empty" onClick={onClick} />;
}

/** Grab a frame every `every` seconds from a video file. */
async function frames(file: File, every: number, onProgress: (p: number) => void): Promise<string[]> {
  const v = document.createElement("video"); v.muted = true; v.src = URL.createObjectURL(file);
  await new Promise(r => (v.onloadedmetadata = r));
  const c = document.createElement("canvas"), scale = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight));
  c.width = Math.round(v.videoWidth * scale); c.height = Math.round(v.videoHeight * scale);
  const out: string[] = [];
  for (let t = 0.5; t < v.duration; t += every) {
    v.currentTime = t; await new Promise(r => (v.onseeked = r));
    c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height); out.push(c.toDataURL("image/jpeg", 0.7)); onProgress(t / v.duration);
  }
  URL.revokeObjectURL(v.src); return out;
}

export default function Proofhouse() {
  const [items, setItems] = useStored<Item[]>(T, "items", SAMPLE);
  const [cur, setCur] = useStored(T, "cur", "TND");
  const [owner, setOwner] = useStored(T, "owner", { name: "Leila Haddad", address: "14 Rue Ibn Khaldoun, El Menzah 6", policy: "" });
  const [shots, setShots] = useState<string[]>([]);
  const [prog, setProg] = useState<number | null>(null);
  const [room, setRoom] = useState("Living room");
  const [d, setD] = useState({ name: "", category: "Electronics", value: "", year: String(new Date().getFullYear()), serial: "" });
  const [shot, setShot] = useState<string | null>(null);
  const money = moneyFmt(cur);
  const now = new Date().getFullYear();
  const today = (i: Item) => { const life = CATS[i.category] ?? 7; return life ? Math.max(i.value * 0.2, i.value * (1 - (now - i.year) / life)) : i.value; };
  const total = items.reduce((a, i) => a + i.value, 0), current = items.reduce((a, i) => a + today(i), 0);
  const byRoom = ROOMS.map(r => ({ r, list: items.filter(i => i.room === r) })).filter(x => x.list.length);

  const add = async (e: React.FormEvent) => {
    e.preventDefault(); if (!d.name.trim()) return;
    const id = uid(); if (shot) await idbSet(`${T}:${id}`, shot);
    setItems([...items, { id, room, name: d.name.trim(), category: d.category, value: parseFloat(d.value) || 0, year: parseInt(d.year) || now, serial: d.serial, photo: !!shot }]);
    setD({ ...d, name: "", value: "", serial: "" }); if (shot) setShots(shots.filter(s => s !== shot)); setShot(null);
  };
  const exportCsv = () => download("home-inventory.csv", toCsv([["Room", "Item", "Category", "Purchase value", "Year bought", "Estimated value today", "Serial number", "Photo"], ...items.map(i => [i.room, i.name, i.category, i.value.toFixed(2), i.year, today(i).toFixed(2), i.serial, i.photo ? "yes" : "no"])]), "text/csv");

  return (
    <div className="stack">
      <Section title="Home inventory" aside={<><CurrencySelect id="ph-cur" value={cur} onChange={setCur} /><button className="btn small" style={{ alignSelf: "flex-end" }} onClick={exportCsv}>Export CSV</button><button className="btn small primary" style={{ alignSelf: "flex-end" }} onClick={() => window.print()}>Print report</button></>}>
        <Stats><Stat value={items.length} label="Items" /><Stat value={money(total)} label="Replacement value" /><Stat value={money(current)} label="Estimated value today" /><Stat value={items.filter(i => i.photo).length} label="With photo proof" /></Stats>
      </Section>
      <Section title="Walk through with your phone">
        <p className="note" style={{ marginBottom: 10 }}>Film each room slowly, opening cupboards and zooming in on serial numbers. Upload the video and pick the frames that show your belongings. The video never leaves this device.</p>
        <label className="btn primary">Choose a walkthrough video<input type="file" accept="video/*" hidden onChange={async e => { const f = e.target.files?.[0]; if (!f) return; setProg(0); try { setShots(await frames(f, 3, setProg)); } finally { setProg(null); } }} /></label>
        {prog !== null && <p className="pill warn" style={{ marginTop: 10 }}>Pulling frames… {Math.round(prog * 100)}%</p>}
        {shots.length > 0 && <><p className="note" style={{ margin: "12px 0 8px" }}>{shots.length} frames. Tap one to turn it into an item.</p><div className="ph-shots">{shots.map((s, i) => <img key={i} src={s} alt={`Frame ${i + 1}`} className={shot === s ? "on" : ""} onClick={() => setShot(s)} />)}</div></>}
      </Section>
      <Section title="Add an item">
        <form className="stack" style={{ gap: 10 }} onSubmit={add}>
          <div className="row" style={{ alignItems: "center" }}>
            {shot ? <img src={shot} alt="Selected frame" className="ph-thumb" /> : <label className="btn small">Photo<input type="file" accept="image/*" hidden onChange={async e => { const f = e.target.files?.[0]; if (f) setShot(await shrinkImage(f, 800)); }} /></label>}
            <label className="field"><span>Room</span><select id="ph-r" className="input" value={room} onChange={e => setRoom(e.target.value)}>{ROOMS.map(r => <option key={r}>{r}</option>)}</select></label>
            <label className="field" style={{ flexGrow: 2 }}><span>Item</span><input id="ph-n" className="input" value={d.name} onChange={e => setD({ ...d, name: e.target.value })} /></label>
            <label className="field"><span>Category</span><select id="ph-c" className="input" value={d.category} onChange={e => setD({ ...d, category: e.target.value })}>{Object.keys(CATS).map(c => <option key={c}>{c}</option>)}</select></label>
          </div>
          <div className="row" style={{ alignItems: "flex-end" }}>
            <label className="field"><span>What it cost</span><input id="ph-v" className="input num" value={d.value} onChange={e => setD({ ...d, value: e.target.value })} /></label>
            <label className="field"><span>Year bought</span><input id="ph-y" className="input num" value={d.year} onChange={e => setD({ ...d, year: e.target.value })} /></label>
            <label className="field" style={{ flexGrow: 2 }}><span>Serial or model number</span><input id="ph-s" className="input" value={d.serial} onChange={e => setD({ ...d, serial: e.target.value })} /></label>
            <button className="btn primary" type="submit">Add item</button>
          </div>
        </form>
      </Section>
      <section className="panel ph-report">
        <h2>Contents inventory</h2>
        <p className="note">{owner.name} · {owner.address}{owner.policy && ` · Policy ${owner.policy}`} · Prepared {new Date().toLocaleDateString()}</p>
        {byRoom.map(({ r, list }) => (
          <div key={r} style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: 20 }}>{r} <span className="note">{money(list.reduce((a, i) => a + i.value, 0))}</span></h3>
            <div className="table-wrap"><table className="t"><thead><tr><th /><th>Item</th><th>Serial</th><th className="r">Bought</th><th className="r">Cost</th><th className="r">Today</th><th className="no-print" /></tr></thead>
              <tbody>{list.map(i => <tr key={i.id}><td style={{ width: 60 }}>{i.photo ? <Thumb id={i.id} /> : null}</td><td>{i.name}<br /><span className="note">{i.category}</span></td><td style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{i.serial}</td><td className="r">{i.year}</td><td className="r">{money(i.value)}</td><td className="r">{money(today(i))}</td><td className="no-print"><button className="btn ghost small danger" onClick={() => { setItems(items.filter(x => x.id !== i.id)); idbDel(`${T}:${i.id}`); }}>×</button></td></tr>)}</tbody></table></div>
          </div>
        ))}
        <p className="note" style={{ marginTop: 14 }}>“Today” is a simple straight-line estimate. Your insurer may value items differently.</p>
      </section>
      <Section title="Policy details" className="no-print">
        <div className="row"><label className="field"><span>Name</span><input id="ph-on" className="input" value={owner.name} onChange={e => setOwner({ ...owner, name: e.target.value })} /></label><label className="field" style={{ flexGrow: 2 }}><span>Address</span><input id="ph-oa" className="input" value={owner.address} onChange={e => setOwner({ ...owner, address: e.target.value })} /></label><label className="field"><span>Policy number</span><input id="ph-op" className="input" value={owner.policy} onChange={e => setOwner({ ...owner, policy: e.target.value })} /></label></div>
      </Section>
      <style>{`.ph-shots{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:6px;max-height:340px;overflow:auto}.ph-shots img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:6px;cursor:pointer;border:3px solid transparent}.ph-shots img.on{border-color:var(--accent)}
      .ph-thumb{width:56px;height:56px;object-fit:cover;border-radius:6px;display:block}.ph-empty{background:var(--sunk)}
      @media print{body *{visibility:hidden}.ph-report,.ph-report *{visibility:visible}.ph-report{position:absolute;inset:0 auto auto 0;width:100%;box-shadow:none}.no-print{display:none!important}}`}</style>
    </div>
  );
}

import { seed, AGENTS, publicState } from "/domain.js";
const $ = (id) => document.getElementById(id),
  esc = (x) =>
    String(x ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    ),
  fmt = (x) => Number(x || 0).toLocaleString("en-US");
let team = "harbour",
  state = seed(team),
  csrf = "",
  connected = false,
  pending = false,
  replaying = false,
  replayIndex = 0,
  filter = "all",
  generation = 0,
  lastRender = "",
  toastTimer;
const descriptions = {
    index: "Catalogue / title cleanup",
    caption: "Access / poster descriptions",
    bulletin: "Programme / publication",
  },
  taskNames = {
    index: "Title cleaned",
    caption: "Description saved",
    bulletin: "Owner publication",
  };
function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("visible"), 5500);
}
function tokenCount(u) {
  return Number(u.input || 0) + Number(u.output || 0) + Number(u.cache || 0);
}
function cost(u) {
  return u.estimatedUsd > 0
    ? "$" + u.estimatedUsd.toFixed(4) + " estimated"
    : u.unknownCosts
      ? "Cost unavailable"
      : "No cost reported";
}
function signal(a) {
  if (["killed", "quarantined"].includes(a.mode)) return [a.mode, "stopped"];
  if (a.mode === "paused") return ["paused", "held"];
  if (a.phase === "approval") return ["your signal", "held"];
  if (a.phase === "failed") return ["reading failed", "stopped"];
  if (a.phase === "planning") return ["reading", "active"];
  if (a.phase === "ready") return ["working", "active"];
  if (a.phase === "queued") return ["queued", "held"];
  if (a.phase === "done") return ["complete", ""];
  return ["ready", ""];
}
function filteredEvents() {
  return state.events.filter((e) => filter === "all" || e.agent === filter);
}
function render() {
  const key =
    team +
    ":" +
    state.revision +
    ":" +
    connected +
    ":" +
    pending +
    ":" +
    replaying +
    ":" +
    replayIndex +
    ":" +
    filter;
  if (lastRender === key) return;
  lastRender = key;
  $("fleet-name").textContent =
    team === "harbour" ? "HARBOUR FESTIVAL" : "NORTH HALL / WINTER REELS";
  $("run-label").textContent = state.run
    ? "RUN " + String(state.run).padStart(2, "0")
    : "AWAITING DISPATCH";
  const active = Object.values(state.agents).filter(
    (a) => a.mode === "active" && ["planning", "ready"].includes(a.phase),
  ).length;
  $("signal-count").textContent = "3 SIGNALS / " + active + " MOVING";
  $("connection").className = "connection" + (connected ? " online" : "");
  $("connection").innerHTML =
    "<i></i>" +
    (connected ? "Live fleet service connected" : "Live AI service offline");
  const canStart = Object.values(state.agents).every(
    (a) =>
      ["idle", "done", "failed"].includes(a.phase) ||
      ["killed", "quarantined"].includes(a.mode),
  );
  $("start").disabled =
    !connected || pending || replaying || !canStart || state.run >= 5;
  $("start").innerHTML = state.run
    ? "Dispatch a fresh run <span>↗</span>"
    : "Dispatch fleet <span>↗</span>";
  $("scenario").disabled = !canStart || pending || replaying;
  $("export").href = "/api/export?team=" + team;
  document.body.classList.toggle("replaying", replaying);
  $("lanes").innerHTML = AGENTS.map((id) => {
    const a = state.agents[id],
      [label, klass] = signal(a),
      done = a.phase === "done";
    const paused = a.mode === "paused";
    const stopped = ["killed", "quarantined"].includes(a.mode);
    const disabled = pending || replaying;
    return `<article class="lane ${a.phase === "planning" ? "planning" : ""}" data-agent="${id}"><div class="lane-title"><button class="agent-name" data-inspect="${id}" aria-label="Inspect ${a.name}"><span class="monogram">${a.name[0]}</span><span><strong>${a.name} ↗</strong><small>${descriptions[id]}</small></span></button><span class="signal ${klass}"><i></i>${label}</span></div><div class="tracks">${[0, 1, 2].map((n) => `<div class="track-step ${n < a.cursor ? "done" : n === a.cursor && ["ready", "approval"].includes(a.phase) && a.mode === "active" ? "current" : ""}">${taskNames[id]}<span>F${n + 1} / ${n < a.cursor ? "CLOSED" : n === a.cursor && a.phase === "approval" ? "APPROVAL" : "PENDING"}</span></div>`).join("")}</div><div class="lane-bottom"><div class="agent-usage"><strong>${fmt(tokenCount(a.usage))}</strong> tokens · ${a.completed} writes<br>${cost(a.usage)}${a.usage.unknownCosts ? " · incomplete" : ""}</div><div class="agent-controls"><button data-op="${paused ? "resume" : "pause"}" data-agent="${id}" ${disabled || stopped || done || ["idle", "failed"].includes(a.phase) ? "disabled" : ""}>${paused ? "▶ Resume" : "Ⅱ Pause"}</button><button class="kill" data-kill="${id}" ${disabled || stopped || done || a.phase === "idle" ? "disabled" : ""}>■ Kill</button></div></div>${a.blocker ? '<p class="blocker">' + esc(a.blocker) + "</p>" : ""}</article>`;
  }).join("");
  $("records").innerHTML = state.records
    .map(
      (r) =>
        `<div class="film"><span class="film-id">${r.id}</span><div><strong>${esc(r.title)}</strong><small class="${r.published ? "published" : ""}">${r.published ? "↗ Published snapshot" : r.caption ? "Description ready" : "Draft · waiting on the line"}</small></div><button data-record="${r.id}">View ↗</button></div>`,
    )
    .join("");
  const approvals = state.approvals.filter((q) => q.status === "pending");
  $("decision-count").textContent = String(approvals.length).padStart(2, "0");
  $("approvals").innerHTML = approvals.length
    ? approvals
        .map(
          (q) =>
            `<article class="approval"><small>BULLETIN / ${q.id}</small><h3>${esc(q.title)}</h3><p>Publish this exact draft to ${esc(team === "harbour" ? "Harbour Festival" : "North Hall")}. Review before it leaves the line.</p><button data-review="${q.id}" ${pending || replaying || state.agents[q.agent].mode !== "active" ? "disabled" : ""}>Review this publication ↗</button>${state.agents[q.agent].mode === "paused" ? "<p>Resume Bulletin to make this decision.</p>" : ""}</article>`,
        )
        .join("")
    : '<div class="empty-desk">No decisions waiting.<br>The next risky move stops here.</div>';
  const usage = Object.values(state.agents).map((a) => a.usage),
    total = usage.reduce((n, u) => n + tokenCount(u), 0),
    estimated = usage.reduce((n, u) => n + u.estimatedUsd, 0);
  $("total-tokens").innerHTML = fmt(total) + " <small>tokens</small>";
  $("total-cost").textContent = estimated
    ? "$" + estimated.toFixed(4) + " estimated"
    : total
      ? "Cost unavailable"
      : "No model calls yet";
  const events = filteredEvents();
  $("replay").disabled = pending || events.length === 0;
  $("replay").textContent = replaying ? "↶ Restart replay" : "↶ Replay steps";
  $("replay-agent").value = filter;
  $("replay-bar").hidden = !replaying;
  let display = events.slice(-10).reverse();
  if (replaying) {
    replayIndex = Math.min(replayIndex, Math.max(0, events.length - 1));
    $("scrub").max = String(Math.max(0, events.length - 1));
    $("scrub").value = String(replayIndex);
    $("replay-position").textContent = replayIndex + 1 + " / " + events.length;
    $("replay-caption").textContent = "READ-ONLY REPLAY · LIVE FLEET CONTINUES";
    display = events.length ? [events[replayIndex]] : [];
  }
  $("events").innerHTML = display.length
    ? display
        .map(
          (e) =>
            `<button class="log-event ${["scope_refused", "quarantined", "killed", "discarded", "failed"].includes(e.type) ? "warning" : ""}" data-event="${e.seq}"><span class="seq">${String(e.seq).padStart(3, "0")}</span><span class="who">${esc(e.agent)}</span><span class="what">${esc(e.summary)}</span><span class="time">${new Date(e.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} ↗</span></button>`,
        )
        .join("")
    : '<p class="empty-log">Dispatch the fleet. Real decisions and control events appear here.</p>';
}
async function poll() {
  const turn = generation,
    currentTeam = team;
  try {
    const r = await fetch(
      "/api/state?team=" + currentTeam + "&after=" + state.sequence,
      { cache: "no-store" },
    );
    const p = await r.json();
    if (turn !== generation) return;
    if (!r.ok) throw Error(p.message);
    if (p.state.revision >= state.revision) state = p.state;
    csrf = p.csrf;
    connected = p.connected;
    render();
  } catch {
    if (turn === generation) {
      connected = false;
      render();
    }
  }
}
async function command(c) {
  if (pending || replaying) return;
  pending = true;
  render();
  const turn = generation;
  try {
    const r = await fetch("/api/command?team=" + team, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Switchyard-CSRF": csrf,
      },
      body: JSON.stringify({
        ...c,
        revision: state.revision,
        request: crypto.randomUUID(),
      }),
    });
    const p = await r.json();
    if (turn !== generation) return;
    if (!r.ok) throw Error(p.message || "The command could not finish.");
    if (p.state.revision >= state.revision) state = p.state;
    connected = p.connected;
    if ($("detail").open) $("detail").close();
    toast(
      c.op === "kill"
        ? "Run killed. Late results cannot execute."
        : c.op === "pause"
          ? "Execution paused. Any active reading may still incur tokens."
          : c.op === "start"
            ? "Fleet dispatched. Each agent starts its own reading."
            : c.op === "approve"
              ? "Exact publication approved and committed."
              : "Control signal committed.",
    );
  } catch (e) {
    toast(e.message);
    await poll();
  } finally {
    pending = false;
    render();
  }
}
function modal(kicker, html) {
  $("detail-kicker").textContent = kicker;
  $("detail-content").innerHTML = html;
  if (!$("detail").open) $("detail").showModal();
}
function inspect(id) {
  const a = state.agents[id];
  modal(
    "AGENT / " + id.toUpperCase(),
    `<h2>${a.name}, on the line.</h2><p>${descriptions[id]}. ${id === "bulletin" ? "Every publication needs a separate, exact owner approval." : "Only this agent’s permitted draft fields can change."}</p><div class="detail-box"><small>RECORDED USAGE / ALL RUNS</small><p>${fmt(a.usage.input)} input · ${fmt(a.usage.output)} output · ${fmt(a.usage.cache)} cache-read tokens</p><p>${cost(a.usage)}${a.usage.unknownCosts ? " · " + a.usage.unknownCosts + " reading(s) with unavailable cost" : ""}</p><p>Stopping a run revokes record changes. It cannot guarantee that a provider stops billing an already-started reading.</p></div>${
      a.trace.length
        ? a.trace
            .slice()
            .reverse()
            .map(
              (t) =>
                `<div class="trace"><h3>Run ${t.run} · ${t.accepted ? "usable plan" : "discarded / unusable"}</h3><p>${esc(t.summary)}</p><small>${esc(t.model)} · ${fmt(tokenCount(t.usage))} reported tokens · ${typeof t.usage.estimatedUsd === "number" ? "$" + t.usage.estimatedUsd.toFixed(4) + " client estimate" : "cost unavailable"}</small>${t.plan ? '<div class="detail-box"><small>PROPOSED OPERATIONS</small><pre>' + esc(JSON.stringify(t.plan.steps, null, 2)) + "</pre></div>" : ""}</div>`,
            )
            .join("")
        : "<p>No AI reading has completed for this agent.</p>"
    }`,
  );
}
function record(id) {
  const r = state.records.find((x) => x.id === id);
  modal(
    "PROGRAMME RECORD / " + id,
    `<h2>${esc(r.title)}</h2><div class="detail-box"><small>SUPPLIED POSTER BRIEF</small><p>${esc(r.brief)}</p></div><div class="detail-box"><small>ACCESSIBILITY DESCRIPTION / DRAFT</small><p>${esc(r.caption || "Not written yet.")}</p></div>${r.publication ? '<div class="detail-box"><small>APPROVED PUBLICATION SNAPSHOT</small><h3>' + esc(r.publication.title) + "</h3><p>" + esc(r.publication.caption || "No description at approval time.") + "</p><p>Source revision " + r.publication.sourceVersion + ". Later draft edits do not rewrite this snapshot.</p></div>" : "<p>This record has not been published.</p>"}`,
  );
}
function review(id) {
  const q = state.approvals.find((x) => x.id === id && x.status === "pending");
  if (!q) return;
  const a = state.agents[q.agent],
    stale =
      state.records.find((r) => r.id === q.step.recordId)?.version !==
      q.recordVersion;
  modal(
    "EXACT PUBLICATION / " + q.id,
    `<h2>${stale ? "This draft<br>changed on the line." : "Give this draft<br>the green signal?"}</h2><p>This approves one snapshot for the ${team === "harbour" ? "Harbour Festival" : "North Hall"} programme. It does not approve future drafts or any other channel.</p><div class="detail-box"><small>${esc(q.step.recordId)} → ${esc(q.step.channel)}</small><h3>${esc(q.preview.title)}</h3><p>${esc(q.preview.caption || "No accessibility description is present in this draft.")}</p><p>Record revision ${q.recordVersion}</p></div>${stale ? '<p class="warning-text">Another agent updated this record. Request a fresh snapshot before approving it.</p>' : q.preview.caption ? "" : '<p class="warning-text">This snapshot has no accessibility description. You can decline it.</p>'}<div class="detail-actions"><button data-decision="deny" data-approval="${q.id}" data-digest="${q.digest}">Decline draft</button><button class="primary" data-decision="${stale ? "refresh" : "approve"}" data-approval="${q.id}" data-digest="${q.digest}" ${a.mode !== "active" ? "disabled" : ""}>${stale ? "Request fresh snapshot ↗" : "Approve & publish ↗"}</button></div>`,
  );
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.op) command({ op: b.dataset.op, agent: b.dataset.agent });
  if (b.dataset.kill) {
    const id = b.dataset.kill;
    modal(
      "TERMINATE / " + id.toUpperCase(),
      `<h2>Kill ${state.agents[id].name}’s run?</h2><p>Uncommitted operations and pending approvals are revoked. Committed edits stay on the record. This run cannot resume; you can dispatch a fresh fleet later.</p><p>Already-started AI work may still be charged. A late result will be recorded but cannot change the programme.</p><div class="detail-actions"><button id="cancel-kill">Keep running</button><button class="primary" data-op="kill" data-agent="${id}">Kill this run ■</button></div>`,
    );
  }
  if (b.id === "cancel-kill") $("detail").close();
  if (b.dataset.inspect) inspect(b.dataset.inspect);
  if (b.dataset.record) record(b.dataset.record);
  if (b.dataset.review) review(b.dataset.review);
  if (b.dataset.decision)
    command({
      op: b.dataset.decision,
      approval: b.dataset.approval,
      digest: b.dataset.digest,
    });
  if (b.dataset.event) {
    const event = state.events.find((x) => x.seq === Number(b.dataset.event));
    if (event)
      modal(
        "EVENT / " + String(event.seq).padStart(3, "0"),
        `<h2>${esc(event.type.replaceAll("_", " "))}</h2><p>${esc(event.summary)}</p><p>${esc(event.agent)} · run ${event.run} · ${new Date(event.at).toLocaleString()}</p><div class="detail-box"><small>RECORDED DECISION AND CHANGE</small><pre>${esc(JSON.stringify(event.detail, null, 2))}</pre></div>`,
      );
  }
});
$("close").onclick = () => $("detail").close();
$("start").onclick = () =>
  command({ op: "start", scenario: $("scenario").value });
$("team").onchange = async () => {
  generation++;
  team = $("team").value;
  state = seed(team);
  csrf = "";
  replaying = false;
  lastRender = "";
  if ($("detail").open) $("detail").close();
  render();
  await poll();
};
$("replay-agent").onchange = () => {
  filter = $("replay-agent").value;
  replayIndex = 0;
  render();
};
$("replay").onclick = () => {
  replaying = true;
  replayIndex = 0;
  render();
  $("replay-bar").scrollIntoView({ block: "center", behavior: "smooth" });
};
$("scrub").oninput = () => {
  replayIndex = Number($("scrub").value);
  render();
};
$("live").onclick = () => {
  replaying = false;
  render();
};
render();
await poll();
setInterval(poll, 1200);

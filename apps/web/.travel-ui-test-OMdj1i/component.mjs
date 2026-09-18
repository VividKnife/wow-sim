// app/activity-progress.tsx
import { useEffect, useState } from "react";
import { Footprints, Navigation } from "lucide-react";

// components/ui/button.tsx
import { cva } from "class-variance-authority";
import { Slot } from "radix-ui";

// lib/utils.ts
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// components/ui/button.tsx
import { jsx } from "react/jsx-runtime";
var buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40",
        outline: "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline"
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);
function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}) {
  const Comp = asChild ? Slot.Root : "button";
  return /* @__PURE__ */ jsx(
    Comp,
    {
      "data-slot": "button",
      "data-variant": variant,
      "data-size": size,
      className: cn(buttonVariants({ variant, size, className })),
      ...props
    }
  );
}

// app/game-ui.tsx
import { jsx as jsx2, jsxs } from "react/jsx-runtime";
var duration = (ms) => {
  const seconds = Math.max(0, Math.ceil(ms / 1e3));
  return seconds >= 60 ? `${Math.floor(seconds / 60)}\u5206${seconds % 60}\u79D2` : `${seconds}\u79D2`;
};
function Icon({ src, name, size = 40 }) {
  return src ? /* @__PURE__ */ jsx2("img", { src, alt: "", title: name, width: size, height: size, className: "game-icon" }) : /* @__PURE__ */ jsx2("span", { className: "game-icon missing-icon", style: { width: size, height: size }, title: `${name} \xB7 \u56FE\u6807\u5F85\u6536\u5F55`, children: name.slice(0, 1) });
}

// app/activity-progress.tsx
import { Fragment, jsx as jsx3, jsxs as jsxs2 } from "react/jsx-runtime";
function Progress({ label, start, end, clock, running, journey }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!running) return;
    const began = performance.now();
    const timer = setInterval(() => setElapsed(performance.now() - began), 50);
    return () => clearInterval(timer);
  }, [running]);
  const total = Math.max(1, end - start), current = Math.min(total, Math.max(0, clock - start + (running ? elapsed : 0))), percent = current / total * 100;
  if (journey) {
    const TravelIcon = journey.flight ? Navigation : Footprints;
    return /* @__PURE__ */ jsxs2("section", { className: "travel-progress", "aria-label": "\u65C5\u9014\u8FDB\u5EA6", children: [
      /* @__PURE__ */ jsxs2("div", { className: "travel-progress-heading", children: [
        /* @__PURE__ */ jsxs2("span", { children: [
          /* @__PURE__ */ jsx3(TravelIcon, { size: 18, "aria-hidden": "true" }),
          journey.flight ? "\u98DE\u884C\u4E2D" : "\u884C\u8FDB\u4E2D"
        ] }),
        /* @__PURE__ */ jsxs2("strong", { children: [
          percent >= 100 ? "\u7B49\u5F85\u62B5\u8FBE\u786E\u8BA4" : `\u8FD8\u6709 ${duration(total - current)}`,
          /* @__PURE__ */ jsxs2("small", { children: [
            Math.floor(percent),
            "%"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "travel-progress-route", children: [
        /* @__PURE__ */ jsx3("span", { children: journey.from }),
        /* @__PURE__ */ jsx3("span", { children: journey.to })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "travel-progress-track", role: "progressbar", "aria-label": `${journey.from}\u81F3${journey.to}`, "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": Math.floor(percent), "aria-valuetext": `${Math.floor(percent)}%\uFF0C${percent >= 100 ? "\u7B49\u5F85\u62B5\u8FBE\u786E\u8BA4" : `\u5269\u4F59${duration(total - current)}`}`, children: [
        /* @__PURE__ */ jsx3("div", { className: "travel-progress-distance", style: { width: `${percent}%` } }),
        /* @__PURE__ */ jsx3("span", { className: "travel-progress-marker", style: { left: `${percent}%` }, "aria-hidden": "true", children: /* @__PURE__ */ jsx3(TravelIcon, { size: 16 }) })
      ] })
    ] });
  }
  return /* @__PURE__ */ jsxs2("div", { className: "activity-progress", role: "progressbar", "aria-label": label, "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": Math.round(percent), "aria-valuetext": `${label}\uFF0C${Math.round(percent)}%`, children: [
    /* @__PURE__ */ jsx3("div", { className: "activity-progress-fill", style: { width: `${percent}%` } }),
    /* @__PURE__ */ jsx3("span", { children: label }),
    /* @__PURE__ */ jsx3("b", { children: percent >= 100 ? "\u7B49\u5F85\u5B8C\u6210" : `${((total - current) / 1e3).toFixed(1)} \u79D2 \xB7 ${Math.floor(percent)}%` })
  ] });
}
function ActivityProgress({ state: s, data: d, running = true }) {
  const a = s.activity, cast = s.cast;
  let start = a.startedAt, end = a.endsAt, label = a.spell ? d.skills?.find((skill) => skill.spellId === a.spell)?.name : void 0;
  if (a.type === "travel") label = a.flight ? "\u98DE\u884C\u4E2D" : "\u884C\u8FDB\u4E2D";
  else if (a.type === "conjure") {
    label = label || "\u5236\u9020\u8865\u7ED9";
    start ??= (end || 0) - (d.skills?.find((skill) => skill.spellId === a.spell)?.cast || 3e3);
  } else if (a.type === "hearth") {
    label = `\u7089\u77F3 \xB7 \u8FD4\u56DE${d.hearthstone?.destinationName || ""}`;
    start ??= (end || 0) - 1e4;
  } else if (["classSpell", "classChannel"].includes(a.type)) label = label || "\u804C\u4E1A\u6280\u80FD";
  else if (a.type === "teleport") label = label || "\u4F20\u9001\u672F";
  else if (a.type === "mount") label = `\u53EC\u5524${d.mounts?.collection.find((m) => m.id === a.mount)?.name || "\u5750\u9A91"}`;
  else if (s.combat && cast) {
    start = cast.startedAt;
    end = cast.until;
    label = d.combatSkills?.find((skill) => skill.spellId === cast.spell)?.name || "\u65BD\u6CD5";
  } else if (!s.combat && s.rest) {
    start = s.rest.startedAt;
    end = s.rest.until;
    label = s.rest.foodUntil > s.clock && s.rest.waterUntil > s.clock ? "\u8FDB\u98DF\u4E0E\u996E\u6C34" : s.rest.foodUntil > s.clock ? "\u8FDB\u98DF" : "\u996E\u6C34";
  } else if (!["resurrect", "questItem"].includes(a.type)) end = void 0;
  const journey = a.type === "travel" ? { from: d.map?.find((n) => n.id === a.from)?.name || a.from || "\u51FA\u53D1\u5730", to: d.map?.find((n) => n.id === a.to)?.name || a.to || "\u76EE\u7684\u5730", flight: !!a.flight } : void 0;
  return /* @__PURE__ */ jsxs2(Fragment, { children: [
    start !== void 0 && end !== void 0 && Number.isFinite(start) && Number.isFinite(end) && end > start && /* @__PURE__ */ jsx3(Progress, { label: label || "\u65BD\u6CD5", start, end, clock: s.clock, running: running && !s.presence?.paused, journey }, `${s.clock}:${start}:${end}:${running}`),
    " ",
    !!d.itemBuffs?.length && /* @__PURE__ */ jsx3("div", { className: "utility-buffs", "aria-label": "\u7269\u54C1\u589E\u76CA", children: d.itemBuffs.map((buff) => /* @__PURE__ */ jsxs2("span", { children: [
      /* @__PURE__ */ jsx3(Icon, { src: buff.icon, name: buff.name, size: 24 }),
      buff.name,
      /* @__PURE__ */ jsx3("small", { children: duration(buff.until - s.clock) })
    ] }, buff.spell)) })
  ] });
}

// app/world-map.tsx
import { useEffect as useEffect2, useState as useState2 } from "react";

// lib/world-map.js
var mapRegions = {
  "\u827E\u5C14\u6587": { name: "\u827E\u5C14\u6587\u68EE\u6797 \xB7 \u5317\u90E1", image: "/maps/elwynn-classic.jpg" },
  "\u66B4\u98CE\u57CE": { name: "\u66B4\u98CE\u57CE", image: "/maps/stormwind-classic.jpg" },
  "\u897F\u90E8\u8352\u91CE": { name: "\u897F\u90E8\u8352\u91CE", image: "/maps/westfall-classic.jpg" },
  "\u4E3B\u57CE\u4F20\u9001": { name: "\u4E3B\u57CE\u4F20\u9001 \xB7 \u670D\u52A1\u8282\u70B9\u793A\u610F", image: null },
  "\u4FE1\u4F7F\u8DEF\u7EBF": { name: "\u4FE1\u4F7F\u8DEF\u7EBF", image: null }
};
var mapRegion = (region) => region === "\u5317\u90E1" ? "\u827E\u5C14\u6587" : region;
function travelMapFrame(state, elapsed = 0) {
  const a = state.activity;
  if (a.type !== "travel") return { journey: { from: state.location, to: state.location, progress: 0 }, legs: [], remaining: 0 };
  const total = Math.max(1, a.endsAt - a.startedAt), current = Math.max(0, Math.min(total, state.clock - a.startedAt + Math.max(0, elapsed)));
  const path = a.flight || !a.path?.length ? [{ a: a.from, b: a.to, duration: total }] : a.path;
  const costs = path.map((e) => Math.max(0, e.duration ?? e.distance / 7 * 1e3));
  let remainingCost = current, from = a.from, journey = null;
  const legs = path.map((e, index) => {
    const to = e.a === from ? e.b : e.a, cost = costs[index], startProgress = e.startProgress || 0, progress = startProgress + (1 - startProgress) * (cost > 0 ? Math.max(0, Math.min(1, remainingCost / cost)) : 1);
    const leg = { from, to, progress, startProgress };
    if (!journey && (progress < 1 || index === path.length - 1)) journey = { from, to, progress };
    remainingCost -= cost;
    from = to;
    return leg;
  });
  return { journey: journey || { from: a.from, to: a.to, progress: current / total }, legs, remaining: total - current };
}
var mapPoints = {
  darnassus: [24, 16],
  orgrimmar: [76, 58],
  thunderbluff: [42, 70],
  moonglade: [55, 25],
  undercity: [50, 30],
  northshire: [49, 42],
  northwood: [48, 34],
  echo: [48, 25],
  vineyard: [55, 49],
  goldshire: [42, 65],
  fargodeep: [39, 80],
  stonefield: [33, 86],
  maclure: [48, 87],
  mirror: [29, 59],
  crystal: [54, 65],
  jasper: [61, 53],
  tower: [75, 73],
  logging: [85, 65],
  brackwell: [70, 80],
  westbrook: [24, 72],
  forestedge: [24, 83],
  stormwind: [57, 56],
  magetower: [35, 69],
  bluerecluse: [43, 80],
  oldtown: [70, 44],
  dwarven: [60, 23],
  cathedral: [43, 37],
  park: [21, 51],
  keep: [81, 18],
  furlbrow: [51, 21],
  saldean: [54, 32],
  jansen: [43, 28],
  sentinel: [55, 52],
  alexton: [39, 51],
  moonbrook: [44, 68],
  daggerhills: [56, 76],
  coastnorth: [29, 25],
  coast: [24, 63],
  lighthouse: [30, 88],
  deadmines: [42, 83],
  lakeshire: [22, 79],
  ironforge: [22, 22],
  thelsamar: [57, 45],
  algaz: [78, 20],
  silverstream: [81, 65]
};
function playerMapPoint(journey, map) {
  const from = map.find((n) => n.id === journey.from), to = map.find((n) => n.id === journey.to);
  if (!from || !to) return null;
  const a = mapPoints[from.id], b = mapPoints[to.id];
  if (!a || !b) return null;
  const region = mapRegion(from.region), crossing = region !== mapRegion(to.region);
  return { region, x: crossing ? a[0] : a[0] + (b[0] - a[0]) * journey.progress, y: crossing ? a[1] : a[1] + (b[1] - a[1]) * journey.progress, crossing };
}

// app/world-map.tsx
import { jsx as jsx4, jsxs as jsxs3 } from "react/jsx-runtime";
function useTravelElapsed(clock, startedAt, endsAt, moving) {
  const [sample, setSample] = useState2({ clock, startedAt, endsAt, elapsed: 0 });
  useEffect2(() => {
    if (!moving) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const origin = performance.now();
    const draw = (now) => {
      if (document.visibilityState !== "visible") return;
      const elapsed = motion.matches ? 0 : Math.max(0, now - origin);
      setSample({ clock, startedAt, endsAt, elapsed });
      if (!motion.matches && clock + elapsed < (endsAt ?? clock)) frame = requestAnimationFrame(draw);
    };
    const resume = () => {
      cancelAnimationFrame(frame);
      if (document.visibilityState === "visible") frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    document.addEventListener("visibilitychange", resume);
    motion.addEventListener("change", resume);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", resume);
      motion.removeEventListener("change", resume);
    };
  }, [clock, startedAt, endsAt, moving]);
  return moving && sample.clock === clock && sample.startedAt === startedAt && sample.endsAt === endsAt ? sample.elapsed : 0;
}
function WorldMap({ state: s, data: d, busy, send }) {
  const moving = s.activity.type === "travel";
  const elapsed = useTravelElapsed(s.clock, s.activity.startedAt, s.activity.endsAt, moving);
  const frame = travelMapFrame(s, elapsed), player = playerMapPoint(frame.journey, d.map);
  const [selection, setSelection] = useState2(null);
  const region = selection && selection.origin === s.location ? selection.region : mapRegion(d.location.region);
  const config = mapRegions[region];
  const points = d.map.filter((n) => mapRegion(n.region) === region);
  const locked = busy || !!s.combat || s.hp <= 0 || !(["idle", "hunt"].includes(s.activity.type) || moving && !s.activity.flight);
  const select = (region2) => setSelection({ region: region2, origin: s.location });
  const at = (id) => mapPoints[id];
  const legs = frame.legs.filter((leg) => at(leg.from) && at(leg.to) && points.some((n) => n.id === leg.from) && points.some((n) => n.id === leg.to));
  const routeLegs = frame.legs;
  const nextLeg = routeLegs.findIndex((leg) => leg.progress < 1);
  const waypointIds = routeLegs.length ? [routeLegs[0].from, ...routeLegs.map((leg) => leg.to)] : [];
  const travel = (id) => send({ type: "travel", to: id });
  return /* @__PURE__ */ jsxs3("section", { className: "panel map-panel", "aria-label": "\u533A\u57DF\u5730\u56FE", children: [
    /* @__PURE__ */ jsxs3("div", { className: "map-toolbar", children: [
      /* @__PURE__ */ jsx4("div", { className: "filterbar", children: Object.entries(mapRegions).map(([id, r]) => /* @__PURE__ */ jsx4("button", { className: region === id ? "active" : "", "aria-pressed": region === id, onClick: () => select(id), children: r.name }, id)) }),
      /* @__PURE__ */ jsx4(Button, { variant: "outline", size: "sm", onClick: () => select(player?.region || mapRegion(d.location.region)), children: "\u5B9A\u4F4D\u73A9\u5BB6" })
    ] }),
    /* @__PURE__ */ jsxs3("div", { className: "map-status", role: "status", children: [
      /* @__PURE__ */ jsx4("strong", { children: moving ? `${s.activity.flight ? "\u98DE\u884C" : "\u884C\u8FDB"}\u4E2D \u2192 ${d.map.find((n) => n.id === s.activity.to)?.name}` : `\u5F53\u524D\u4F4D\u7F6E\uFF1A${d.location.name}` }),
      /* @__PURE__ */ jsxs3("span", { children: [
        moving ? frame.remaining > 0 ? `\u5269\u4F59 ${duration(frame.remaining)}` : "\u7B49\u5F85\u62B5\u8FBE\u786E\u8BA4" : "\u70B9\u51FB\u5730\u56FE\u4E0A\u7684\u5730\u70B9\u51FA\u53D1",
        player?.region !== region ? " \xB7 \u73A9\u5BB6\u5728\u5176\u4ED6\u533A\u57DF" : "",
        player?.crossing ? " \xB7 \u8DE8\u533A\u9014\u4E2D" : ""
      ] })
    ] }),
    moving && waypointIds.length > 0 && /* @__PURE__ */ jsx4("ol", { className: "map-waypoints", "aria-label": "\u6CBF\u9014\u8DEF\u70B9", children: waypointIds.map((id, index) => {
      const passed = index === 0 || routeLegs[index - 1].progress >= 1, next = index === nextLeg + 1 && nextLeg >= 0;
      return /* @__PURE__ */ jsxs3("li", { className: next ? "is-next" : passed ? "is-passed" : "", "aria-current": next ? "step" : void 0, children: [
        /* @__PURE__ */ jsx4("span", { "aria-hidden": "true", children: passed ? "\u2713" : index }),
        /* @__PURE__ */ jsx4("b", { children: index === 0 && routeLegs[0].startProgress > 0 ? "\u6539\u9053\u4F4D\u7F6E" : d.map.find((n) => n.id === id)?.name || id }),
        next && /* @__PURE__ */ jsx4("small", { children: "\u4E0B\u4E00\u7AD9" })
      ] }, `${index}:${id}`);
    }) }),
    /* @__PURE__ */ jsx4("div", { className: "region-map-scroll", tabIndex: 0, "aria-label": "\u5730\u70B9\u5730\u56FE\uFF0C\u7A84\u5C4F\u53EF\u6A2A\u5411\u6EDA\u52A8", children: /* @__PURE__ */ jsxs3("div", { className: "region-map " + (!config.image ? "schematic-map" : ""), children: [
      config.image ? /* @__PURE__ */ jsx4("img", { className: "region-map-art", src: config.image, alt: config.name + "\u533A\u57DF\u5730\u56FE" }) : /* @__PURE__ */ jsxs3("div", { className: "courier-background", children: [
        /* @__PURE__ */ jsx4("strong", { children: "\u4FE1\u4F7F\u8DEF\u7EBF" }),
        /* @__PURE__ */ jsx4("span", { children: "\u8DE8\u533A\u57DF\u9A7F\u7AD9\u793A\u610F\u56FE" })
      ] }),
      /* @__PURE__ */ jsx4("svg", { className: "map-route", viewBox: "0 0 100 100", preserveAspectRatio: "none", "aria-hidden": "true", children: legs.map((leg, i) => {
        const a = at(leg.from), b = at(leg.to);
        return /* @__PURE__ */ jsxs3("g", { children: [
          /* @__PURE__ */ jsx4("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1] }),
          leg.progress > 0 && /* @__PURE__ */ jsx4("line", { className: "map-route-completed", x1: a[0] + (b[0] - a[0]) * leg.startProgress, y1: a[1] + (b[1] - a[1]) * leg.startProgress, x2: a[0] + (b[0] - a[0]) * leg.progress, y2: a[1] + (b[1] - a[1]) * leg.progress })
        ] }, i);
      }) }),
      points.map((n, i) => {
        const p = at(n.id), current = !moving && n.id === s.location;
        if (!p) return null;
        const flight = n.hasFlight ? ` \xB7 \u9E1F\u70B9${n.flightUnlocked ? "\u5DF2\u89E3\u9501" : "\u672A\u53D1\u73B0"}` : "";
        return /* @__PURE__ */ jsxs3("button", { className: "map-pin " + (current ? "is-current " : "") + (n.id === s.activity.to ? "is-destination " : "") + (n.hasFlight ? "has-flight " : ""), style: { left: p[0] + "%", top: p[1] + "%" }, disabled: locked || (moving ? n.id === s.activity.to : n.id === s.location) || n.travel === null, onClick: () => travel(n.id), "aria-label": `${n.name}${current ? " \xB7 \u5F53\u524D\u4F4D\u7F6E" : ` \xB7 ${moving ? "\u6539\u9053\u524D\u5F80" : "\u524D\u5F80"} \xB7 ${n.travel === null ? "\u9700\u4F20\u9001\u62B5\u8FBE" : duration(n.travel)}`}${flight}`, title: `${n.name} \xB7 Lv.${n.min}\u2014${n.max}${flight}`, children: [
          /* @__PURE__ */ jsx4("span", { className: "map-pin-dot", children: n.hasFlight ? "\u2197" : n.kind === "dungeon" ? "\u2694" : i + 1 }),
          /* @__PURE__ */ jsxs3("span", { className: "map-pin-label", children: [
            n.name,
            n.hasFlight && /* @__PURE__ */ jsxs3("small", { className: n.flightUnlocked ? "flight-discovered" : "", children: [
              "\u2197 ",
              n.flightUnlocked ? "\u9E1F\u70B9\u5DF2\u89E3\u9501" : "\u9E1F\u70B9\u672A\u53D1\u73B0"
            ] })
          ] })
        ] }, n.id);
      }),
      player && player.region === region && /* @__PURE__ */ jsxs3("div", { className: "map-player" + (moving ? " is-moving" : ""), style: { left: player.x + "%", top: player.y + "%" }, role: "img", "aria-label": moving ? "\u73A9\u5BB6\u4F4D\u7F6E\uFF1A\u65C5\u884C\u4E2D" : "\u73A9\u5BB6\u5F53\u524D\u4F4D\u7F6E", children: [
        /* @__PURE__ */ jsx4("span", { children: "\u25B2" }),
        /* @__PURE__ */ jsx4("b", { children: moving ? s.activity.flight ? "\u98DE\u884C\u4E2D" : "\u884C\u8FDB\u4E2D" : "\u4F60\u5728\u8FD9\u91CC" })
      ] }, region)
    ] }) }),
    /* @__PURE__ */ jsxs3("div", { className: "map-legend", children: [
      /* @__PURE__ */ jsx4("span", { children: "\u25B2 \u73A9\u5BB6" }),
      /* @__PURE__ */ jsx4("span", { children: "\u6570\u5B57 / \u2694 \u5730\u70B9" }),
      /* @__PURE__ */ jsx4("span", { children: "\u2197 \u9E1F\u70B9\uFF08\u6807\u6CE8\u89E3\u9501\u72B6\u6001\uFF09" }),
      /* @__PURE__ */ jsx4("span", { children: "\u865A\u7EBF\uFF1A\u5F85\u884C\u8FDB \xB7 \u84DD\u7EBF\uFF1A\u5DF2\u8D70\u8FC7" })
    ] }),
    /* @__PURE__ */ jsxs3("details", { className: "map-location-list", children: [
      /* @__PURE__ */ jsxs3("summary", { children: [
        "\u5730\u70B9\u5217\u8868 \xB7 ",
        points.length,
        " \u4E2A\u5730\u70B9"
      ] }),
      /* @__PURE__ */ jsx4("div", { className: "location-grid", children: points.map((n, i) => /* @__PURE__ */ jsxs3("button", { disabled: locked || (moving ? n.id === s.activity.to : n.id === s.location) || n.travel === null, className: "location-node " + (n.id === s.location ? "current" : ""), onClick: () => travel(n.id), children: [
        /* @__PURE__ */ jsxs3("strong", { children: [
          i + 1,
          ". ",
          n.name
        ] }),
        /* @__PURE__ */ jsx4("small", { children: !moving && n.id === s.location ? "\u5F53\u524D\u4F4D\u7F6E" : `Lv.${n.min}\u2014${n.max} \xB7 ${n.travel === null ? "\u9700\u4F20\u9001\u62B5\u8FBE" : duration(n.travel)}` }),
        n.hasFlight && /* @__PURE__ */ jsxs3("small", { children: [
          "\u2197 ",
          n.flightUnlocked ? "\u9E1F\u70B9\u5DF2\u89E3\u9501" : "\u9E1F\u70B9\u672A\u53D1\u73B0"
        ] })
      ] }, n.id)) })
    ] }),
    /* @__PURE__ */ jsxs3("p", { className: "footnote", children: [
      moving ? s.activity.flight ? "\u98DE\u884C\u671F\u95F4\u4E0D\u53EF\u6539\u9053\u3002" : "\u70B9\u51FB\u5176\u4ED6\u5730\u70B9\u53EF\u968F\u65F6\u6539\u9053\u6216\u6298\u8FD4\uFF0C\u6309\u5F53\u524D\u4F4D\u7F6E\u8BA1\u7B97\u8DEF\u7A0B\u3002" : "",
      "\u5730\u70B9\u6309\u533A\u57DF\u5730\u56FE\u8FD1\u4F3C\u6807\u6CE8\uFF1B\u79FB\u52A8\u6CBF\u73B0\u6709\u9053\u8DEF\u8BA1\u65F6\u3002\u9E1F\u70B9\u9700\u5230\u98DE\u884C\u7BA1\u7406\u5458\u5904\u53D1\u73B0\u3002",
      region === "\u4FE1\u4F7F\u8DEF\u7EBF" ? "\u4FE1\u4F7F\u8DEF\u7EBF\u4E3A\u9A7F\u7AD9\u793A\u610F\uFF0C\u4E0D\u4EE3\u8868\u5730\u7406\u6BD4\u4F8B\u3002" : ""
    ] })
  ] });
}
export {
  WorldMap,
  ActivityProgress as default
};

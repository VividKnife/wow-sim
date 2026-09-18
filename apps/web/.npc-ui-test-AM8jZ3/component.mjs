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
var money = (c) => `${Math.floor(c / 1e4) ? Math.floor(c / 1e4) + " \u91D1 " : ""}${Math.floor(c % 1e4 / 100) ? Math.floor(c % 1e4 / 100) + " \u94F6 " : ""}${c % 100} \u94DC`;
var duration = (ms) => {
  const seconds = Math.max(0, Math.ceil(ms / 1e3));
  return seconds >= 60 ? `${Math.floor(seconds / 60)}\u5206${seconds % 60}\u79D2` : `${seconds}\u79D2`;
};
function Icon({ src, name, size = 40 }) {
  return src ? /* @__PURE__ */ jsx2("img", { src, alt: "", title: name, width: size, height: size, className: "game-icon" }) : /* @__PURE__ */ jsx2("span", { className: "game-icon missing-icon", style: { width: size, height: size }, title: `${name} \xB7 \u56FE\u6807\u5F85\u6536\u5F55`, children: name.slice(0, 1) });
}
function Bar({ value, max, label, tone = "health" }) {
  return /* @__PURE__ */ jsxs("div", { className: "resource " + tone, "aria-label": `${label} ${Math.ceil(value)} / ${max}`, children: [
    /* @__PURE__ */ jsx2("div", { style: { width: Math.min(100, Math.max(0, value / max * 100)) + "%" } }),
    /* @__PURE__ */ jsxs("span", { children: [
      label,
      " ",
      /* @__PURE__ */ jsxs("b", { children: [
        Math.ceil(value),
        " / ",
        max
      ] })
    ] })
  ] });
}
function Item({ item, instance, onEquip, onSell }) {
  if (!item) return null;
  return /* @__PURE__ */ jsxs("div", { className: "item-row quality-" + item.quality, children: [
    /* @__PURE__ */ jsx2(Icon, { src: item.icon, name: item.name }),
    /* @__PURE__ */ jsxs("div", { className: "grow", children: [
      /* @__PURE__ */ jsx2("strong", { children: item.name }),
      instance?.count > 1 && /* @__PURE__ */ jsxs("span", { children: [
        " \xD7",
        instance.count
      ] }),
      /* @__PURE__ */ jsxs("small", { children: [
        item.level > 0 ? `\u9700\u8981\u7B49\u7EA7 ${item.level} \xB7 ` : "",
        item.armor ? `${item.armor} \u62A4\u7532 \xB7 ` : "",
        item.damage ? `${item.damage.join("\u2014")} \u4F24\u5BB3 \xB7 ${item.speed / 1e3}\u79D2` : "",
        item.stats.map((s) => ` +${s.value}${{ 3: "\u654F\u6377", 4: "\u529B\u91CF", 5: "\u667A\u529B", 6: "\u7CBE\u795E", 7: "\u8010\u529B" }[s.type] || "\u5C5E\u6027"}`).join("")
      ] })
    ] }),
    onEquip && item.slot > 0 && /* @__PURE__ */ jsx2(Button, { variant: "outline", size: "sm", onClick: onEquip, children: "\u88C5\u5907" }),
    onSell && item.sell > 0 && /* @__PURE__ */ jsx2(Button, { variant: "ghost", size: "sm", onClick: onSell, children: "\u5356\u51FA" })
  ] });
}

// app/player-hud.tsx
import { jsx as jsx3, jsxs as jsxs2 } from "react/jsx-runtime";
function PlayerHud({ state: s, data: d }) {
  const resource = d.resource || { name: "\u6CD5\u529B", value: s.mana, max: d.stats.maxMana };
  return /* @__PURE__ */ jsx3("section", { className: "player-hud", "aria-label": "\u73A9\u5BB6\u72B6\u6001", children: /* @__PURE__ */ jsxs2("div", { className: "player-hud-inner", children: [
    /* @__PURE__ */ jsxs2("div", { className: "hud-identity", children: [
      /* @__PURE__ */ jsx3("div", { className: "identity-crest compact", "aria-hidden": "true", children: d.className?.slice(0, 1) || "\u52C7" }),
      /* @__PURE__ */ jsxs2("div", { children: [
        /* @__PURE__ */ jsxs2("strong", { children: [
          s.name,
          " ",
          /* @__PURE__ */ jsxs2("span", { className: "level-badge", children: [
            "Lv. ",
            s.level
          ] })
        ] }),
        /* @__PURE__ */ jsxs2("small", { children: [
          d.faction === "Horde" ? "\u90E8\u843D" : "\u8054\u76DF",
          " \xB7 ",
          d.raceName,
          " \xB7 ",
          d.className
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "hud-vitals", children: [
      /* @__PURE__ */ jsx3(Bar, { label: "\u751F\u547D", value: s.hp, max: d.stats.maxHp }),
      resource.max > 0 && /* @__PURE__ */ jsx3(Bar, { label: resource.name, value: resource.value, max: resource.max, tone: resource.name === "\u6012\u6C14" ? "rage" : resource.name === "\u80FD\u91CF" ? "energy" : "mana" })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "hud-experience", children: [
      /* @__PURE__ */ jsxs2("div", { children: [
        /* @__PURE__ */ jsx3("span", { children: s.level >= 60 ? "\u5DF2\u8FBE\u7B49\u7EA7\u4E0A\u9650" : "\u7ECF\u9A8C" }),
        /* @__PURE__ */ jsx3("span", { children: s.level >= 60 ? "Lv.60" : `${s.xp} / ${d.nextXp}` })
      ] }),
      /* @__PURE__ */ jsx3(Bar, { label: "\u7ECF\u9A8C", value: s.level >= 60 ? 1 : s.xp, max: s.level >= 60 ? 1 : d.nextXp || 1, tone: "xp" }),
      /* @__PURE__ */ jsxs2("small", { className: "wallet", children: [
        "\u6301\u6709\u8D27\u5E01\u3000",
        money(s.money)
      ] })
    ] })
  ] }) });
}

// app/world.tsx
import { useState as useState9 } from "react";

// app/dungeon.tsx
import { Fragment, jsx as jsx4, jsxs as jsxs3 } from "react/jsx-runtime";
function RecoveryControls({ state: s, data: d, busy, send }) {
  const r = d.recovery;
  if (!r) return null;
  return /* @__PURE__ */ jsxs3("section", { className: "recovery-controls", "aria-label": "\u5C0F\u961F\u6062\u590D", children: [
    /* @__PURE__ */ jsxs3("div", { className: "section-heading", children: [
      /* @__PURE__ */ jsx4("h3", { children: "\u4F11\u6574\u4E0E\u8865\u7ED9" }),
      /* @__PURE__ */ jsxs3("small", { children: [
        "\u98DF\u7269 ",
        r.food,
        " \xB7 \u996E\u6C34 ",
        r.water
      ] })
    ] }),
    /* @__PURE__ */ jsxs3("div", { className: "action-row", children: [
      /* @__PURE__ */ jsx4(Button, { variant: "outline", disabled: busy || !r.canRest, onClick: () => send({ type: "rest" }), children: s.dungeon ? "\u5C0F\u961F\u5750\u4E0B\u6062\u590D" : "\u5750\u4E0B\u6062\u590D" }),
      /* @__PURE__ */ jsx4(Button, { variant: "outline", disabled: busy || !r.canConjureWater, onClick: () => send({ type: "conjure", water: true }), children: "\u5236\u9020\u996E\u6C34" }),
      /* @__PURE__ */ jsx4(Button, { variant: "outline", disabled: busy || !r.canConjureFood, onClick: () => send({ type: "conjure", water: false }), children: "\u5236\u9020\u98DF\u7269" })
    ] }),
    /* @__PURE__ */ jsx4("p", { className: "footnote", children: s.dungeon ? "\u6BCF\u540D\u6210\u5458\u5355\u72EC\u6D88\u8017\u80CC\u5305\u4E2D\u7684\u8865\u7ED9\uFF1B\u6062\u590D\u7ED3\u675F\u540E\u518D\u7EE7\u7EED\u63A8\u8FDB\u3002" : "\u53EF\u5728\u6CD5\u5E08\u8BAD\u7EC3\u5E08\u5904\u5B66\u4E60\u9020\u9910\u672F\u4E0E\u9020\u6C34\u672F\u3002" }),
    r.fallen.length > 0 && /* @__PURE__ */ jsxs3("div", { className: "fallen-members", children: [
      /* @__PURE__ */ jsx4("h3", { children: "\u5012\u4E0B\u7684\u6210\u5458" }),
      r.fallen.map((c) => /* @__PURE__ */ jsxs3("div", { className: "recovery-target", children: [
        /* @__PURE__ */ jsxs3("div", { className: "grow", children: [
          /* @__PURE__ */ jsx4("strong", { children: c.name }),
          !c.canResurrect && /* @__PURE__ */ jsx4("small", { children: c.reason })
        ] }),
        /* @__PURE__ */ jsx4(Button, { variant: "outline", disabled: busy || !c.canResurrect, onClick: () => send({ type: "resurrect", target: c.id }), children: "\u7267\u5E08\u590D\u6D3B" })
      ] }, c.id)),
      /* @__PURE__ */ jsx4(Button, { variant: "outline", disabled: busy || !r.canRevive, onClick: () => send({ type: "revive" }), children: "\u5012\u4E0B\u6210\u5458\u8FD4\u56DE\u5C38\u4F53" })
    ] })
  ] });
}
function Dungeon(props) {
  const { state: s, data: d, busy, send } = props, dm = d.dungeon;
  if (!dm) return null;
  if (!dm.active) return /* @__PURE__ */ jsxs3("section", { className: "panel dungeon-entry", "aria-label": "\u6B7B\u4EA1\u77FF\u4E95\u5165\u53E3", children: [
    /* @__PURE__ */ jsxs3("div", { className: "section-heading", children: [
      /* @__PURE__ */ jsxs3("div", { children: [
        /* @__PURE__ */ jsx4("div", { className: "eyebrow", children: "\u897F\u90E8\u8352\u91CE \xB7 \u4E94\u4EBA\u5730\u4E0B\u57CE" }),
        /* @__PURE__ */ jsx4("h2", { children: "\u6B7B\u4EA1\u77FF\u4E95" })
      ] }),
      /* @__PURE__ */ jsx4("span", { className: "dungeon-sigil", "aria-hidden": "true", children: "\u2694" })
    ] }),
    /* @__PURE__ */ jsx4("p", { children: "\u77FF\u9053\u6DF1\u5904\uFF0C\u8FEA\u83F2\u4E9A\u5144\u5F1F\u4F1A\u6B63\u5728\u5EFA\u9020\u4E00\u8258\u6218\u8230\u3002\u53EC\u96C6\u5766\u514B\u3001\u6CBB\u7597\u548C\u8F93\u51FA\u961F\u53CB\uFF0C\u6DF1\u5165\u77FF\u4E95\u5BFB\u627E\u8303\u514B\u91CC\u592B\u3002" }),
    /* @__PURE__ */ jsxs3("div", { className: "dungeon-requirements", children: [
      /* @__PURE__ */ jsxs3("span", { children: [
        "\u6700\u4F4E\u7B49\u7EA7 ",
        dm.minimumLevel
      ] }),
      /* @__PURE__ */ jsx4("span", { children: "\u5EFA\u8BAE 18\u201420 \u7EA7\u6311\u6218" }),
      /* @__PURE__ */ jsxs3("span", { children: [
        "\u5C0F\u961F ",
        s.party.length + 1,
        " / 5 \u4EBA"
      ] })
    ] }),
    dm.saved && /* @__PURE__ */ jsxs3("p", { className: "dungeon-notice", children: [
      "\u5DF2\u4FDD\u5B58\u8DEF\u7EBF\u8FDB\u5EA6 ",
      dm.progress,
      " / ",
      dm.total,
      "\uFF1B\u518D\u6B21\u8FDB\u5165\u4F1A\u63A5\u7EED\u672C\u6B21\u5192\u9669\u3002"
    ] }),
    dm.saved && /* @__PURE__ */ jsxs3("details", { className: "dungeon-notice", children: [
      /* @__PURE__ */ jsx4("summary", { children: "\u91CD\u65B0\u6311\u6218\u526F\u672C" }),
      /* @__PURE__ */ jsx4("p", { children: "\u91CD\u7F6E\u4F1A\u6E05\u9664\u672C\u6B21\u8DEF\u7EBF\u3001\u602A\u7269\u548C\u673A\u5173\u8FDB\u5EA6\u3002\u5DF2\u83B7\u5F97\u7684\u88C5\u5907\u53CA\u4EFB\u52A1\u8FDB\u5EA6\u4FDD\u7559\uFF1B\u4E0B\u6B21\u8FDB\u5165\u4ECE\u5934\u5F00\u59CB\u3002\u6BCF\u5C0F\u65F6\u6700\u591A\u8FDB\u5165\u4E94\u4E2A\u65B0\u526F\u672C\u3002" }),
      /* @__PURE__ */ jsx4(Button, { variant: "outline", disabled: busy || !dm.canReset, onClick: () => send({ type: "resetDungeon" }), children: "\u6E05\u9664\u65E7\u8DEF\u7EBF\u5E76\u91CD\u7F6E" }),
      dm.resetReason && /* @__PURE__ */ jsx4("p", { children: dm.resetReason })
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "action-row", children: dm.atEntrance ? /* @__PURE__ */ jsx4(Button, { disabled: busy || !dm.canEnter, onClick: () => send({ type: "enterDungeon" }), children: dm.saved ? "\u91CD\u8FD4\u6B7B\u4EA1\u77FF\u4E95" : "\u8FDB\u5165\u6B7B\u4EA1\u77FF\u4E95" }) : /* @__PURE__ */ jsx4(Button, { variant: "outline", disabled: busy || !!s.combat || !["idle", "hunt"].includes(s.activity.type) || s.hp <= 0, onClick: () => send({ type: "travel", to: "deadmines" }), children: "\u524D\u5F80\u6B7B\u4EA1\u77FF\u4E95\u5165\u53E3" }) }),
    dm.entryReason && /* @__PURE__ */ jsx4("p", { className: "footnote", children: dm.entryReason }),
    /* @__PURE__ */ jsx4("p", { className: "footnote", children: "\u5F00\u59CB\u63A8\u8FDB\u540E\uFF0C\u5C0F\u961F\u4F1A\u8FDE\u7EED\u8FCE\u6218\u3001\u4F11\u6574\u5E76\u5B8C\u6210\u673A\u5173\uFF1B\u7267\u5E08\u5B58\u6D3B\u65F6\u6218\u540E\u81EA\u52A8\u590D\u6D3B\u961F\u53CB\uFF0C\u7267\u5E08\u5012\u4E0B\u3001\u80CC\u5305\u5DF2\u6EE1\u6216\u62FE\u53D6\u53D7\u963B\u65F6\u6682\u505C\u3002" }),
    dm.atEntrance && d.recovery.fallen.length > 0 && /* @__PURE__ */ jsx4(RecoveryControls, { ...props })
  ] });
  const current = dm.current, progress = Math.min(100, dm.progress / dm.total * 100);
  const activityLabels = { dungeonCannon: "\u706B\u70AE\u5DF2\u7ECF\u70B9\u71C3", resurrect: "\u7267\u5E08\u6B63\u5728\u590D\u6D3B\u961F\u53CB", revive: "\u5012\u4E0B\u6210\u5458\u6B63\u5728\u8FD4\u56DE\u5C38\u4F53", conjure: "\u6B63\u5728\u5236\u9020\u8865\u7ED9" };
  return /* @__PURE__ */ jsxs3("section", { className: "dungeon-expedition", "aria-label": "\u6B7B\u4EA1\u77FF\u4E95\u526F\u672C", children: [
    /* @__PURE__ */ jsxs3("header", { className: "panel dungeon-header dungeon-loading-card", children: [
      /* @__PURE__ */ jsxs3("div", { className: "section-heading", children: [
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx4("div", { className: "eyebrow", children: "\u4E94\u4EBA\u5730\u4E0B\u57CE \xB7 \u5F53\u524D\u5192\u9669" }),
          /* @__PURE__ */ jsx4("h1", { children: "\u6B7B\u4EA1\u77FF\u4E95" })
        ] }),
        /* @__PURE__ */ jsx4(Button, { variant: "outline", disabled: busy || !dm.canLeave, onClick: () => send({ type: "leaveDungeon" }), children: "\u79BB\u5F00\u526F\u672C" })
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "section-heading", children: [
        /* @__PURE__ */ jsx4("span", { children: dm.completed ? "\u8DEF\u7EBF\u5DF2\u5B8C\u6210" : `\u8DEF\u7EBF\u8FDB\u5EA6 ${dm.progress} / ${dm.total}` }),
        /* @__PURE__ */ jsx4("small", { children: "\u9000\u51FA\u4FDD\u7559\u8FDB\u5EA6" })
      ] }),
      /* @__PURE__ */ jsx4("div", { className: "dungeon-progress", role: "progressbar", "aria-label": "\u526F\u672C\u8DEF\u7EBF\u8FDB\u5EA6", "aria-valuemin": 0, "aria-valuemax": dm.total, "aria-valuenow": dm.progress, children: /* @__PURE__ */ jsx4("i", { style: { width: progress + "%" } }) }),
      /* @__PURE__ */ jsx4("p", { className: "footnote", children: "\u81EA\u52A8\u63A8\u8FDB\u4FDD\u7559\u5168\u90E8\u6218\u6597\u4E0E\u8865\u7ED9\u6D88\u8017\u3002\u53EF\u968F\u65F6\u6682\u505C\uFF0C\u6218\u6597\u4E2D\u7684\u6682\u505C\u4F1A\u5728\u672C\u573A\u7ED3\u675F\u540E\u505C\u6B62\u8FCE\u6218\u3002" }),
      (!dm.completed || dm.autoAdvance) && /* @__PURE__ */ jsx4("div", { className: "action-row", children: dm.autoAdvance ? /* @__PURE__ */ jsx4(Button, { variant: "outline", disabled: busy, onClick: () => send({ type: "dungeonPause" }), children: "\u6682\u505C\u63A8\u8FDB" }) : /* @__PURE__ */ jsx4(Button, { disabled: busy || !dm.canNext, onClick: () => send({ type: "dungeonNext" }), children: dm.advanceReason ? "\u7EE7\u7EED\u81EA\u52A8\u63A8\u8FDB" : "\u5F00\u59CB\u81EA\u52A8\u63A8\u8FDB" }) }),
      dm.autoAdvance ? /* @__PURE__ */ jsx4("p", { className: "dungeon-notice", role: "status", children: s.combat ? "\u81EA\u52A8\u63A8\u8FDB\u4E2D \xB7 \u5C0F\u961F\u6B63\u5728\u6218\u6597" : dm.rescuing ? s.activity.type === "resurrect" ? "\u81EA\u52A8\u63A8\u8FDB\u4E2D \xB7 \u7267\u5E08\u6B63\u5728\u590D\u6D3B\u961F\u53CB" : "\u81EA\u52A8\u63A8\u8FDB\u4E2D \xB7 \u7267\u5E08\u6062\u590D\u6CD5\u529B\u5E76\u51C6\u5907\u590D\u6D3B\u961F\u53CB" : dm.waitingForLoot ? "\u81EA\u52A8\u63A8\u8FDB\u4E2D \xB7 \u7B49\u5F85\u6218\u5229\u54C1\u62FE\u53D6" : dm.recovering ? "\u81EA\u52A8\u63A8\u8FDB\u4E2D \xB7 \u6309\u6062\u590D\u8BBE\u7F6E\u4F11\u6574\u540E\u7EE7\u7EED" : "\u81EA\u52A8\u63A8\u8FDB\u4E2D \xB7 \u5C0F\u961F\u6B63\u5728\u5B8C\u6210\u673A\u5173" }) : !dm.completed && /* @__PURE__ */ jsx4("p", { className: "dungeon-notice", role: "status", children: dm.nextReason || dm.advanceReason || "\u51C6\u5907\u597D\u540E\u5F00\u59CB\u81EA\u52A8\u63A8\u8FDB\u3002" }),
      !s.settings.autoLoot && /* @__PURE__ */ jsx4("p", { className: "footnote", children: "\u81EA\u52A8\u62FE\u53D6\u5C1A\u672A\u5F00\u542F\uFF1B\u51FA\u73B0\u5F85\u62FE\u53D6\u6218\u5229\u54C1\u65F6\u4F1A\u6682\u505C\uFF0C\u62FE\u53D6\u540E\u53EF\u7EE7\u7EED\u3002\u53EF\u5728\u6218\u5229\u54C1\u9762\u677F\u5F00\u542F\u81EA\u52A8\u62FE\u53D6\u3002" })
    ] }),
    /* @__PURE__ */ jsxs3("div", { className: "dungeon-columns", children: [
      /* @__PURE__ */ jsxs3("section", { className: "panel dungeon-encounter", children: [
        current ? /* @__PURE__ */ jsxs3(Fragment, { children: [
          /* @__PURE__ */ jsxs3("div", { className: "eyebrow", children: [
            current.kind === "boss" ? "\u9996\u9886\u906D\u9047" : current.interaction && !current.enemies.length ? "\u673A\u5173\u4EA4\u4E92" : "\u524D\u65B9\u8DEF\u7EBF",
            current.optional ? " \xB7 \u53EF\u9009" : ""
          ] }),
          /* @__PURE__ */ jsx4("h2", { children: current.name }),
          /* @__PURE__ */ jsx4("ul", { className: "encounter-enemies", children: current.enemies.map((e) => /* @__PURE__ */ jsxs3("li", { children: [
            /* @__PURE__ */ jsx4("strong", { children: e.name }),
            /* @__PURE__ */ jsxs3("span", { children: [
              "Lv.",
              e.level,
              e.elite ? " \u7CBE\u82F1" : "",
              " \xD7 ",
              e.count
            ] })
          ] }, e.entry + "-" + e.level)) }),
          s.combat ? /* @__PURE__ */ jsx4("p", { className: "dungeon-notice", children: "\u6218\u6597\u8FDB\u884C\u4E2D\u3002\u53EF\u5728\u4E0A\u65B9\u6253\u5F00\u6218\u6597\u754C\u9762\u67E5\u770B\u5C0F\u961F\u884C\u52A8\u3002" }) : activityLabels[s.activity.type] ? /* @__PURE__ */ jsxs3("p", { className: "dungeon-notice", role: "status", children: [
            activityLabels[s.activity.type],
            " \xB7 ",
            duration(s.activity.endsAt - s.clock)
          ] }) : /* @__PURE__ */ jsxs3(Fragment, { children: [
            current.interaction && !current.enemies.length && /* @__PURE__ */ jsxs3(Fragment, { children: [
              /* @__PURE__ */ jsxs3("div", { className: "dungeon-object", children: [
                /* @__PURE__ */ jsx4(Icon, { src: dm.interactionIcon, name: "\u8FEA\u83F2\u4E9A\u706B\u836F" }),
                /* @__PURE__ */ jsxs3("div", { children: [
                  /* @__PURE__ */ jsx4("h3", { children: dm.interactionLabel }),
                  /* @__PURE__ */ jsx4("p", { children: current.id === "dm-cannon" ? "\u4F7F\u7528\u4E00\u4EFD\u8FEA\u83F2\u4E9A\u706B\u836F\u8F70\u5F00\u94C1\u95E8\u3002" : "\u5B88\u536B\u5DF2\u6E05\u9664\uFF0C\u4ECE\u706B\u836F\u7BB1\u4E2D\u53D6\u51FA\u706B\u836F\u3002" })
                ] })
              ] }),
              !dm.autoAdvance && /* @__PURE__ */ jsxs3(Fragment, { children: [
                /* @__PURE__ */ jsx4(Button, { disabled: busy || !dm.canInteract, onClick: () => send({ type: "dungeonInteract" }), children: dm.interactionLabel }),
                !dm.canInteract && /* @__PURE__ */ jsx4("p", { className: "footnote", children: dm.interactionReason })
              ] })
            ] }),
            !dm.autoAdvance && dm.canSkip && /* @__PURE__ */ jsx4(Button, { variant: "ghost", disabled: busy, onClick: () => send({ type: "dungeonSkip" }), children: "\u7ED5\u8FC7\u8FD9\u6BB5\u53EF\u9009\u8DEF\u7EBF" })
          ] })
        ] }) : /* @__PURE__ */ jsxs3(Fragment, { children: [
          /* @__PURE__ */ jsx4("div", { className: "eyebrow", children: "\u77FF\u4E95\u65C5\u7A0B" }),
          /* @__PURE__ */ jsx4("h2", { children: "\u8DEF\u7EBF\u5DF2\u5B8C\u6210" }),
          /* @__PURE__ */ jsx4("p", { children: "\u6574\u7406\u6218\u5229\u54C1\uFF0C\u79BB\u5F00\u77FF\u4E95\u540E\u56DE\u5230\u4EFB\u52A1\u4EBA\u7269\u5904\u4EA4\u4ED8\u4EFB\u52A1\u3002" })
        ] }),
        s.activity.reason && /* @__PURE__ */ jsx4("p", { className: "dungeon-notice", role: "status", children: s.activity.reason }),
        (s.pending.length > 0 || s.bag.length >= d.bagCapacity) && /* @__PURE__ */ jsx4("p", { className: "dungeon-notice", children: "\u80CC\u5305\u9700\u8981\u6574\u7406\u3002\u5230\u300C\u89D2\u8272\u300D\u88C5\u5907\u65B0\u7269\u54C1\u6216\u62FE\u53D6\u5F85\u9886\u53D6\u6218\u5229\u54C1\uFF1B\u4E5F\u53EF\u79BB\u5F00\u526F\u672C\u540E\u627E\u5546\u4EBA\u51FA\u552E\u3002" }),
        /* @__PURE__ */ jsx4(RecoveryControls, { ...props })
      ] }),
      /* @__PURE__ */ jsxs3("section", { className: "panel dungeon-party", children: [
        /* @__PURE__ */ jsxs3("div", { className: "section-heading", children: [
          /* @__PURE__ */ jsx4("h2", { children: "\u5C0F\u961F\u72B6\u6001" }),
          /* @__PURE__ */ jsx4("small", { children: "5 \u4EBA" })
        ] }),
        d.recovery.members.map((c) => /* @__PURE__ */ jsxs3("article", { className: "dungeon-member " + (c.hp <= 0 ? "is-fallen" : ""), children: [
          /* @__PURE__ */ jsxs3("div", { className: "section-heading", children: [
            /* @__PURE__ */ jsxs3("strong", { children: [
              c.name,
              " ",
              /* @__PURE__ */ jsxs3("small", { children: [
                "Lv.",
                c.level
              ] })
            ] }),
            /* @__PURE__ */ jsx4("small", { children: c.hp <= 0 ? "\u5DF2\u5012\u4E0B" : c.restUntil > s.clock ? "\u4F11\u6574 " + duration(c.restUntil - s.clock) : c.role })
          ] }),
          /* @__PURE__ */ jsx4(Bar, { label: "\u751F\u547D", value: c.hp, max: c.maxHp }),
          c.maxMana > 0 && /* @__PURE__ */ jsx4(Bar, { label: "\u6CD5\u529B", value: c.mana, max: c.maxMana, tone: "mana" })
        ] }, c.id))
      ] })
    ] }),
    /* @__PURE__ */ jsxs3("details", { className: "panel dungeon-route", children: [
      /* @__PURE__ */ jsxs3("summary", { children: [
        "\u67E5\u770B\u5B8C\u6574\u8DEF\u7EBF \xB7 ",
        dm.progress,
        " / ",
        dm.total
      ] }),
      /* @__PURE__ */ jsx4("ol", { children: dm.route.map((r) => /* @__PURE__ */ jsxs3("li", { className: "route-" + r.status, "aria-current": r.status === "current" ? "step" : void 0, children: [
        /* @__PURE__ */ jsxs3("span", { children: [
          r.name,
          r.optional ? " \xB7 \u53EF\u9009" : ""
        ] }),
        /* @__PURE__ */ jsx4("small", { children: { cleared: "\u5DF2\u5B8C\u6210", skipped: "\u5DF2\u7ED5\u8FC7", current: "\u5F53\u524D", ahead: "\u672A\u63A2\u7D22" }[r.status] })
      ] }, r.id)) })
    ] })
  ] });
}

// app/local-npcs.tsx
import { useState as useState6 } from "react";
import { BookOpen, Store, BedDouble, ScrollText, UserRound } from "lucide-react";

// components/ui/dialog.tsx
import { XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { jsx as jsx5, jsxs as jsxs4 } from "react/jsx-runtime";
function Dialog({
  ...props
}) {
  return /* @__PURE__ */ jsx5(DialogPrimitive.Root, { "data-slot": "dialog", ...props });
}
function DialogPortal({
  ...props
}) {
  return /* @__PURE__ */ jsx5(DialogPrimitive.Portal, { "data-slot": "dialog-portal", ...props });
}
function DialogOverlay({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx5(
    DialogPrimitive.Overlay,
    {
      "data-slot": "dialog-overlay",
      className: cn(
        "fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className
      ),
      ...props
    }
  );
}
function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}) {
  return /* @__PURE__ */ jsxs4(DialogPortal, { "data-slot": "dialog-portal", children: [
    /* @__PURE__ */ jsx5(DialogOverlay, {}),
    /* @__PURE__ */ jsxs4(
      DialogPrimitive.Content,
      {
        "data-slot": "dialog-content",
        className: cn(
          "fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 shadow-lg duration-200 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-lg",
          className
        ),
        ...props,
        children: [
          children,
          showCloseButton && /* @__PURE__ */ jsxs4(
            DialogPrimitive.Close,
            {
              "data-slot": "dialog-close",
              className: "absolute top-4 right-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
              children: [
                /* @__PURE__ */ jsx5(XIcon, {}),
                /* @__PURE__ */ jsx5("span", { className: "sr-only", children: "Close" })
              ]
            }
          )
        ]
      }
    )
  ] });
}
function DialogHeader({ className, ...props }) {
  return /* @__PURE__ */ jsx5(
    "div",
    {
      "data-slot": "dialog-header",
      className: cn("flex flex-col gap-2 text-center sm:text-left", className),
      ...props
    }
  );
}
function DialogTitle({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx5(
    DialogPrimitive.Title,
    {
      "data-slot": "dialog-title",
      className: cn("text-lg leading-none font-semibold", className),
      ...props
    }
  );
}
function DialogDescription({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx5(
    DialogPrimitive.Description,
    {
      "data-slot": "dialog-description",
      className: cn("text-sm text-muted-foreground", className),
      ...props
    }
  );
}

// app/city-services.tsx
import { useState as useState4 } from "react";

// app/storage-market.tsx
import { useState as useState2 } from "react";

// app/batch-trade.tsx
import { useState } from "react";
import { jsx as jsx6, jsxs as jsxs5 } from "react/jsx-runtime";
function BatchTrade({ state: s, data: d, busy, send, auction = false }) {
  const [selected, setSelected] = useState([]), [search, setSearch] = useState("");
  const locked = busy || !!s.combat || !!s.dungeon || !!s.escort || s.hp <= 0 || !["idle", "hunt"].includes(s.activity.type) || !auction && !d.shop.length;
  const eligible = s.bag.filter((i) => auction ? d.inventoryActions[i.uid]?.tradable && Math.floor(d.inventoryActions[i.uid].quote.sell * i.count * 0.95) > 0 : d.inventoryActions[i.uid] && !d.inventoryActions[i.uid].protected && d.items[i.id]?.sell > 0);
  const visible = eligible.filter((i) => d.items[i.id].name.toLowerCase().includes(search.toLowerCase()));
  const chosen = eligible.filter((i) => selected.includes(i.uid)), allVisible = visible.length > 0 && visible.every((i) => selected.includes(i.uid));
  const value = (i) => auction ? Math.floor(d.inventoryActions[i.uid].quote.sell * i.count * 0.95) : d.items[i.id].sell * i.count;
  const total = chosen.reduce((n, i) => n + value(i), 0), remaining = 100 - s.auctions.length, overLimit = auction && chosen.length > remaining;
  async function submit() {
    if (await send({ type: auction ? "auctionSellBatch" : "sellBatch", uids: chosen.map((i) => i.uid) })) setSelected([]);
  }
  return /* @__PURE__ */ jsxs5("section", { "aria-label": auction ? "\u6279\u91CF\u4E0A\u67B6\u7269\u54C1" : "\u6279\u91CF\u51FA\u552E\u7269\u54C1", children: [
    /* @__PURE__ */ jsxs5("p", { children: [
      auction ? "\u52FE\u9009\u80CC\u5305\u7269\u54C1\u6574\u7EC4\u4E0A\u67B6\uFF0C\u91D1\u989D\u5DF2\u6263\u9664 5% \u624B\u7EED\u8D39\u3002\u7ED1\u5B9A\u3001\u9501\u5B9A\u4E0E\u4EFB\u52A1\u7269\u54C1\u4E0D\u53EF\u4E0A\u67B6\u3002" : "\u52FE\u9009\u80CC\u5305\u7269\u54C1\u6574\u7EC4\u51FA\u552E\u3002\u9501\u5B9A\u3001\u4EFB\u52A1\u7269\u54C1\u548C\u914D\u53D1\u88C5\u5907\u4E0D\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\u3002",
      auction && ` \u5F53\u524D\u8FD8\u53EF\u4E0A\u67B6 ${remaining} \u7EC4\u3002`
    ] }),
    /* @__PURE__ */ jsxs5("div", { className: "economy-toolbar", children: [
      /* @__PURE__ */ jsx6("input", { "aria-label": auction ? "\u641C\u7D22\u53EF\u4E0A\u67B6\u7269\u54C1" : "\u641C\u7D22\u53EF\u51FA\u552E\u7269\u54C1", placeholder: "\u641C\u7D22\u80CC\u5305\u7269\u54C1\u2026", value: search, onChange: (e) => setSearch(e.target.value) }),
      /* @__PURE__ */ jsx6(Button, { variant: "outline", disabled: locked || !visible.length, onClick: () => setSelected((previous) => allVisible ? previous.filter((uid) => !visible.some((i) => i.uid === uid)) : [.../* @__PURE__ */ new Set([...previous, ...visible.map((i) => i.uid)])]), children: allVisible ? "\u53D6\u6D88\u5F53\u524D\u5168\u9009" : "\u5168\u9009\u5F53\u524D\u5217\u8868" }),
      /* @__PURE__ */ jsx6(Button, { variant: "ghost", disabled: locked || !selected.length, onClick: () => setSelected([]), children: "\u6E05\u7A7A\u9009\u62E9" })
    ] }),
    /* @__PURE__ */ jsxs5("div", { className: "economy-callout", children: [
      /* @__PURE__ */ jsxs5("p", { "aria-live": "polite", children: [
        "\u5DF2\u9009 ",
        chosen.length,
        " \u7EC4 \xB7 \u5171 ",
        chosen.reduce((n, i) => n + i.count, 0),
        " \u4EF6 \xB7 ",
        auction ? "\u9884\u8BA1\u5230\u8D26" : "\u5408\u8BA1",
        " ",
        money(total)
      ] }),
      overLimit && /* @__PURE__ */ jsx6("p", { role: "status", children: "\u6240\u9009\u7EC4\u6570\u8D85\u8FC7\u5269\u4F59\u4E0A\u67B6\u989D\u5EA6\uFF0C\u8BF7\u51CF\u5C11\u9009\u62E9\u3002" }),
      /* @__PURE__ */ jsx6(Button, { disabled: locked || !chosen.length || overLimit, onClick: submit, children: auction ? "\u6279\u91CF\u4E0A\u67B6\u6240\u9009" : "\u6279\u91CF\u51FA\u552E\u6240\u9009" })
    ] }),
    /* @__PURE__ */ jsx6("div", { className: "storage-list", children: visible.map((i) => /* @__PURE__ */ jsxs5("label", { className: "storage-row", children: [
      /* @__PURE__ */ jsx6("input", { type: "checkbox", "aria-label": `\u9009\u62E9 ${d.items[i.id].name} \xD7${i.count}`, disabled: locked, checked: chosen.some((row) => row.uid === i.uid), onChange: (e) => setSelected((previous) => e.target.checked ? [...previous.filter((uid) => uid !== i.uid), i.uid] : previous.filter((uid) => uid !== i.uid)) }),
      /* @__PURE__ */ jsx6(Icon, { src: d.items[i.id].icon, name: d.items[i.id].name }),
      /* @__PURE__ */ jsxs5("div", { className: "grow", children: [
        /* @__PURE__ */ jsxs5("strong", { className: "rarity-" + d.items[i.id].quality, children: [
          d.items[i.id].name,
          " \xD7",
          i.count
        ] }),
        /* @__PURE__ */ jsxs5("small", { children: [
          i.bound ? "\u5DF2\u7ED1\u5B9A \xB7 " : "",
          d.enchants?.[i.enchant || ""]?.description || ""
        ] })
      ] }),
      /* @__PURE__ */ jsx6("span", { children: money(value(i)) })
    ] }, i.uid)) }),
    !visible.length && /* @__PURE__ */ jsx6("p", { className: "empty", children: eligible.length ? "\u6CA1\u6709\u7B26\u5408\u641C\u7D22\u6761\u4EF6\u7684\u7269\u54C1\u3002" : auction ? "\u6CA1\u6709\u53EF\u4E0A\u67B6\u7684\u7269\u54C1\u3002" : "\u6CA1\u6709\u53EF\u51FA\u552E\u7684\u7269\u54C1\u3002" })
  ] });
}

// app/storage-market.tsx
import { Fragment as Fragment2, jsx as jsx7, jsxs as jsxs6 } from "react/jsx-runtime";
function Bank({ state: s, data: d, busy, send }) {
  const [search, setSearch] = useState2(""), [count, setCount] = useState2(1);
  const locked = busy || !d.bankHere || !!s.combat || !!s.dungeon || !["idle", "hunt"].includes(s.activity.type), valid = Number.isInteger(count) && count > 0;
  const rows = (list, deposit) => /* @__PURE__ */ jsxs6("div", { className: "storage-list", children: [
    list.filter((i) => d.items[i.id]?.name.includes(search)).map((i) => /* @__PURE__ */ jsxs6("div", { className: "storage-row", children: [
      /* @__PURE__ */ jsx7(Icon, { src: d.items[i.id]?.icon, name: d.items[i.id]?.name || "\u7269\u54C1" }),
      /* @__PURE__ */ jsxs6("div", { className: "grow", children: [
        /* @__PURE__ */ jsxs6("strong", { className: "rarity-" + d.items[i.id]?.quality, children: [
          d.items[i.id]?.name,
          " \xD7",
          i.count
        ] }),
        /* @__PURE__ */ jsxs6("small", { children: [
          i.locked ? "\u{1F512} \u5DF2\u9501\u5B9A \xB7 " : "",
          i.bound ? "\u5DF2\u7ED1\u5B9A \xB7 " : "",
          d.enchants[i.enchant || ""]?.description || ""
        ] })
      ] }),
      /* @__PURE__ */ jsxs6(Button, { size: "sm", variant: "outline", disabled: locked || !valid || count > i.count || deposit && !d.inventoryActions[i.uid]?.bankable, onClick: () => send({ type: deposit ? "bankDeposit" : "bankWithdraw", uid: i.uid, count }), children: [
        deposit ? "\u5B58\u5165" : "\u53D6\u51FA",
        " ",
        valid ? count : ""
      ] }),
      /* @__PURE__ */ jsx7(Button, { size: "sm", variant: "ghost", disabled: locked || deposit && !d.inventoryActions[i.uid]?.bankable, onClick: () => send({ type: deposit ? "bankDeposit" : "bankWithdraw", uid: i.uid, count: i.count }), children: "\u6574\u7EC4" })
    ] }, i.uid)),
    !list.length && /* @__PURE__ */ jsx7("p", { className: "empty", children: "\u8FD9\u91CC\u8FD8\u6CA1\u6709\u7269\u54C1\u3002" })
  ] });
  return /* @__PURE__ */ jsxs6("section", { className: "panel", children: [
    /* @__PURE__ */ jsxs6("div", { className: "section-heading", children: [
      /* @__PURE__ */ jsxs6("div", { children: [
        /* @__PURE__ */ jsx7("div", { className: "eyebrow", children: "\u4E2A\u4EBA\u4ED3\u50A8" }),
        /* @__PURE__ */ jsxs6("h2", { children: [
          "\u94F6\u884C ",
          /* @__PURE__ */ jsxs6("small", { children: [
            s.bank.length,
            " / ",
            d.bankCapacity,
            " \u683C"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsx7(Button, { variant: "outline", disabled: locked || !d.bankUpgradeCost || s.money < d.bankUpgradeCost, onClick: () => send({ type: "expandBank" }), children: d.bankUpgradeCost ? "\u6269\u5C55 16 \u683C \xB7 " + money(d.bankUpgradeCost) : "\u5BB9\u91CF\u5DF2\u6EE1" })
    ] }),
    /* @__PURE__ */ jsxs6("p", { children: [
      d.bankHere ? "\u4F60\u5728\u94F6\u884C\u9644\u8FD1\uFF0C\u53EF\u4EE5\u529E\u7406\u5B58\u53D6\u3002" : "\u94F6\u884C\u4F4D\u4E8E\u66B4\u98CE\u57CE\u8D38\u6613\u533A\u4E0E\u94C1\u7089\u5821\uFF1B\u5F53\u524D\u53EF\u4EE5\u67E5\u770B\u5E93\u5B58\u3002",
      "\u88C5\u5907\u7684\u9644\u9B54\u3001\u7ED1\u5B9A\u3001\u8010\u4E45\u548C\u9501\u5B9A\u72B6\u6001\u4F1A\u4FDD\u7559\u3002"
    ] }),
    !d.bankHere && /* @__PURE__ */ jsx7(Button, { variant: "outline", disabled: busy || !!s.combat || !!s.dungeon || !["idle", "hunt"].includes(s.activity.type), onClick: () => send({ type: "travel", to: "stormwind" }), children: "\u524D\u5F80\u66B4\u98CE\u57CE\u94F6\u884C" }),
    /* @__PURE__ */ jsxs6("div", { className: "economy-toolbar", children: [
      /* @__PURE__ */ jsx7("input", { "aria-label": "\u641C\u7D22\u94F6\u884C\u7269\u54C1", placeholder: "\u641C\u7D22\u7269\u54C1\u2026", value: search, onChange: (e) => setSearch(e.target.value) }),
      /* @__PURE__ */ jsxs6("label", { children: [
        "\u6BCF\u6B21\u6570\u91CF ",
        /* @__PURE__ */ jsx7("input", { "aria-label": "\u5B58\u53D6\u6570\u91CF", type: "number", min: 1, max: 100, value: count, onChange: (e) => setCount(Number(e.target.value)) })
      ] }),
      /* @__PURE__ */ jsx7(Button, { variant: "outline", disabled: locked, onClick: () => send({ type: "bankDepositMaterials" }), children: "\u6750\u6599\u4E00\u952E\u5B58\u5165" }),
      /* @__PURE__ */ jsx7(Button, { variant: "outline", disabled: locked, onClick: () => send({ type: "sortBank" }), children: "\u6574\u7406\u94F6\u884C" })
    ] }),
    /* @__PURE__ */ jsxs6("div", { className: "storage-columns", children: [
      /* @__PURE__ */ jsxs6("section", { children: [
        /* @__PURE__ */ jsxs6("h3", { children: [
          "\u968F\u8EAB\u80CC\u5305 \xB7 ",
          s.bag.length,
          "/",
          d.bagCapacity
        ] }),
        rows(s.bag, true)
      ] }),
      /* @__PURE__ */ jsxs6("section", { children: [
        /* @__PURE__ */ jsxs6("h3", { children: [
          "\u94F6\u884C\u5E93\u5B58 \xB7 ",
          s.bank.length,
          "/",
          d.bankCapacity
        ] }),
        rows(s.bank, false)
      ] })
    ] })
  ] });
}
function Auction({ state: s, data: d, busy, send }) {
  const [mode, setMode] = useState2("\u8D2D\u4E70"), [search, setSearch] = useState2(""), [category, setCategory] = useState2("\u5168\u90E8"), [count, setCount] = useState2(1), [page, setPage] = useState2(0);
  const locked = busy || !!s.combat || !!s.dungeon || !["idle", "hunt"].includes(s.activity.type), valid = Number.isInteger(count) && count >= 1 && count <= 100;
  const market = d.market.filter((r) => d.items[r.id]?.name.includes(search) && (category === "\u5168\u90E8" || category === "\u9644\u9B54\u7F8A\u76AE\u7EB8" && r.enchant || category === "\u6750\u6599" && d.items[r.id]?.class === 7 || category === "\u6210\u54C1" && d.items[r.id]?.class !== 7 && !r.enchant));
  const pages = Math.max(1, Math.ceil(market.length / 36)), current = Math.min(page, pages - 1);
  const sellable = s.bag.filter((i) => d.inventoryActions[i.uid]?.tradable && d.items[i.id]?.quality <= 3), gross = sellable.reduce((n, i) => n + Math.floor(d.inventoryActions[i.uid].quote.sell * i.count * 0.95), 0);
  return /* @__PURE__ */ jsxs6("section", { className: "panel", children: [
    /* @__PURE__ */ jsxs6("div", { className: "section-heading", children: [
      /* @__PURE__ */ jsxs6("div", { children: [
        /* @__PURE__ */ jsx7("div", { className: "eyebrow", children: "\u8FDC\u7A0B\u4EA4\u6613 \xB7 \u6A21\u62DF\u5E02\u573A" }),
        /* @__PURE__ */ jsx7("h2", { children: "\u62CD\u5356\u884C" })
      ] }),
      /* @__PURE__ */ jsx7("span", { className: "wallet", children: money(s.money) })
    ] }),
    /* @__PURE__ */ jsx7("p", { children: "\u7CFB\u7EDF\u6309\u56FA\u5B9A\u53C2\u8003\u4EF7\u4F9B\u8D27\u4E0E\u6536\u8D2D\u3002\u4E0A\u67B6\u540E 30 \u79D2\u81EA\u52A8\u6210\u4EA4\uFF0C\u6536\u53D6 5% \u624B\u7EED\u8D39\uFF1B\u4EF7\u683C\u4E0E\u9884\u8BA1\u5230\u8D26\u5747\u63D0\u524D\u663E\u793A\u3002\u79BB\u7EBF\u4E5F\u6309\u6E38\u620F\u65F6\u95F4\u7ED3\u7B97\u3002" }),
    /* @__PURE__ */ jsx7("div", { className: "filterbar", children: ["\u8D2D\u4E70", "\u4E0A\u67B6\u7269\u54C1", "\u6211\u7684\u62CD\u5356", "\u6210\u4EA4\u8BB0\u5F55"].map((t) => /* @__PURE__ */ jsxs6("button", { className: mode === t ? "active" : "", onClick: () => setMode(t), children: [
      t,
      t === "\u6211\u7684\u62CD\u5356" && s.auctions.length > 0 ? " \xB7 " + s.auctions.length : ""
    ] }, t)) }),
    mode === "\u8D2D\u4E70" && /* @__PURE__ */ jsxs6(Fragment2, { children: [
      /* @__PURE__ */ jsxs6("div", { className: "economy-toolbar", children: [
        /* @__PURE__ */ jsx7("input", { "aria-label": "\u641C\u7D22\u62CD\u5356\u5546\u54C1", placeholder: "\u641C\u7D22\u6750\u6599\u3001\u836F\u6C34\u3001\u9644\u9B54\u2026", value: search, onChange: (e) => {
          setSearch(e.target.value);
          setPage(0);
        } }),
        /* @__PURE__ */ jsx7("select", { "aria-label": "\u62CD\u5356\u5546\u54C1\u5206\u7C7B", value: category, onChange: (e) => {
          setCategory(e.target.value);
          setPage(0);
        }, children: ["\u5168\u90E8", "\u6750\u6599", "\u6210\u54C1", "\u9644\u9B54\u7F8A\u76AE\u7EB8"].map((t) => /* @__PURE__ */ jsx7("option", { children: t }, t)) }),
        /* @__PURE__ */ jsxs6("label", { children: [
          "\u8D2D\u4E70\u6570\u91CF ",
          /* @__PURE__ */ jsx7("input", { "aria-label": "\u8D2D\u4E70\u6570\u91CF", type: "number", min: 1, max: 100, value: count, onChange: (e) => setCount(Number(e.target.value)) })
        ] })
      ] }),
      /* @__PURE__ */ jsxs6("div", { className: "economy-toolbar recipe-pagination", children: [
        /* @__PURE__ */ jsxs6("small", { children: [
          "\u5171 ",
          market.length,
          " \u4EF6\u5546\u54C1 \xB7 \u7B2C ",
          current + 1,
          " / ",
          pages,
          " \u9875"
        ] }),
        /* @__PURE__ */ jsx7(Button, { size: "sm", variant: "outline", disabled: current === 0, onClick: () => setPage(current - 1), children: "\u4E0A\u4E00\u9875" }),
        /* @__PURE__ */ jsx7(Button, { size: "sm", variant: "outline", disabled: current >= pages - 1, onClick: () => setPage(current + 1), children: "\u4E0B\u4E00\u9875" })
      ] }),
      /* @__PURE__ */ jsx7("div", { className: "market-grid", children: market.slice(current * 36, (current + 1) * 36).map((r) => /* @__PURE__ */ jsxs6("article", { className: "market-card", children: [
        /* @__PURE__ */ jsxs6("div", { className: "recipe-title", children: [
          /* @__PURE__ */ jsx7(Icon, { src: d.items[r.id]?.icon, name: d.items[r.id]?.name || "\u7269\u54C1" }),
          /* @__PURE__ */ jsxs6("div", { children: [
            /* @__PURE__ */ jsx7("h3", { children: d.items[r.id]?.name }),
            /* @__PURE__ */ jsxs6("small", { children: [
              money(r.buy),
              " / \u4E2A"
            ] })
          ] })
        ] }),
        d.items[r.id]?.description && /* @__PURE__ */ jsx7("p", { className: "enchant-text", children: d.items[r.id].description }),
        /* @__PURE__ */ jsxs6(Button, { size: "sm", variant: "outline", disabled: locked || !valid || s.money < r.buy * count, onClick: () => send({ type: "auctionBuy", id: r.id, count }), children: [
          "\u8D2D\u4E70 \xD7",
          valid ? count : "\u2014",
          " \xB7 ",
          money(valid ? r.buy * count : 0)
        ] })
      ] }, r.id)) }),
      !market.length && /* @__PURE__ */ jsx7("p", { className: "empty", children: "\u6CA1\u6709\u5339\u914D\u7684\u5546\u54C1\u3002" })
    ] }),
    mode === "\u4E0A\u67B6\u7269\u54C1" && /* @__PURE__ */ jsxs6(Fragment2, { children: [
      /* @__PURE__ */ jsxs6("div", { className: "economy-callout", children: [
        /* @__PURE__ */ jsx7("p", { children: "\u4E00\u952E\u4E0A\u67B6\u672A\u9501\u5B9A\u3001\u672A\u7ED1\u5B9A\u7684\u767D\u8272\u3001\u7EFF\u8272\u548C\u84DD\u8272\u7269\u54C1\uFF1B\u4E5F\u53EF\u5728\u4E0B\u65B9\u81EA\u884C\u52FE\u9009\u7269\u54C1\u6279\u91CF\u4E0A\u67B6\u3002" }),
        /* @__PURE__ */ jsxs6(Button, { disabled: locked || !sellable.length || s.auctions.length + sellable.length > 100, onClick: () => send({ type: "auctionSellAll" }), children: [
          "\u5168\u90E8\u5FEB\u6377\u4E0A\u67B6 \xB7 ",
          sellable.length,
          " \u7EC4 \xB7 \u9884\u8BA1 ",
          money(gross)
        ] })
      ] }),
      /* @__PURE__ */ jsx7(BatchTrade, { state: s, data: d, busy: locked, send, auction: true }, s.id)
    ] }),
    mode === "\u6211\u7684\u62CD\u5356" && /* @__PURE__ */ jsxs6(Fragment2, { children: [
      s.auctions.map((a) => /* @__PURE__ */ jsxs6("div", { className: "storage-row", children: [
        /* @__PURE__ */ jsxs6("div", { className: "grow", children: [
          /* @__PURE__ */ jsxs6("strong", { children: [
            d.items[a.item.id]?.name,
            " \xD7",
            a.item.count
          ] }),
          /* @__PURE__ */ jsxs6("small", { children: [
            duration(a.endsAt - s.clock),
            " \u540E\u6210\u4EA4 \xB7 \u9884\u8BA1\u5230\u8D26 ",
            money(a.net)
          ] })
        ] }),
        /* @__PURE__ */ jsx7(Button, { size: "sm", variant: "outline", disabled: locked, onClick: () => send({ type: "auctionCancel", id: a.id }), children: "\u64A4\u56DE\u80CC\u5305" })
      ] }, a.id)),
      !s.auctions.length && /* @__PURE__ */ jsx7("p", { className: "empty", children: "\u6682\u65E0\u6B63\u5728\u51FA\u552E\u7684\u7269\u54C1\u3002" })
    ] }),
    mode === "\u6210\u4EA4\u8BB0\u5F55" && /* @__PURE__ */ jsxs6(Fragment2, { children: [
      s.marketHistory.map((a) => /* @__PURE__ */ jsxs6("div", { className: "storage-row", children: [
        /* @__PURE__ */ jsxs6("span", { className: "grow", children: [
          d.items[a.item]?.name || "\u7269\u54C1",
          " \xD7",
          a.count
        ] }),
        /* @__PURE__ */ jsxs6("strong", { children: [
          "+ ",
          money(a.net)
        ] })
      ] }, a.id)),
      !s.marketHistory.length && /* @__PURE__ */ jsx7("p", { className: "empty", children: "\u6210\u4EA4\u540E\u4F1A\u5728\u8FD9\u91CC\u4FDD\u7559\u6700\u8FD1 30 \u6761\u8BB0\u5F55\u3002" })
    ] })
  ] });
}

// app/professions.tsx
import { useEffect, useState as useState3 } from "react";
import { jsx as jsx8, jsxs as jsxs7 } from "react/jsx-runtime";
function Gathering({ state: s, data: d, busy, send }) {
  const locked = busy || !!s.combat || !["idle", "hunt"].includes(s.activity.type), resources = d.resources || [];
  if (!resources.length) return null;
  return /* @__PURE__ */ jsxs7("section", { className: "panel gathering-panel", children: [
    /* @__PURE__ */ jsxs7("div", { className: "section-heading", children: [
      /* @__PURE__ */ jsxs7("div", { children: [
        /* @__PURE__ */ jsx8("div", { className: "eyebrow", children: "\u571F\u5730\u7684\u9988\u8D60" }),
        /* @__PURE__ */ jsxs7("h2", { children: [
          "\u533A\u57DF\u8D44\u6E90 ",
          /* @__PURE__ */ jsxs7("small", { children: [
            resources.filter((r) => r.available).length,
            " \u5904\u53EF\u91C7\u96C6"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsx8(Button, { disabled: locked || !resources.some((r) => r.available), onClick: () => send({ type: "gatherAll" }), children: "\u81EA\u52A8\u91C7\u96C6\u672C\u533A" })
    ] }),
    /* @__PURE__ */ jsx8("p", { children: "\u6BCF\u6B21\u91C7\u96C6 3 \u79D2\uFF0C\u91C7\u5B8C\u540E 5 \u5206\u949F\u5237\u65B0\u3002\u81EA\u52A8\u91C7\u96C6\u5B8C\u6210\u672C\u533A\u53EF\u91C7\u8D44\u6E90\u540E\u505C\u6B62\uFF1B\u6EE1\u5305\u65F6\u6682\u505C\u3002\u5B66\u4E60\u5265\u76AE\u540E\uFF0C\u51FB\u6740\u91CE\u517D\u4F1A\u81EA\u52A8\u6536\u96C6\u76AE\u9769\u3002" }),
    /* @__PURE__ */ jsx8("div", { className: "resource-cards", children: resources.map((r) => /* @__PURE__ */ jsxs7("div", { className: "resource-card", children: [
      /* @__PURE__ */ jsx8(Icon, { src: d.items[r.item]?.icon, name: r.name }),
      /* @__PURE__ */ jsxs7("div", { className: "grow", children: [
        /* @__PURE__ */ jsx8("strong", { children: r.name }),
        /* @__PURE__ */ jsxs7("small", { children: [
          d.professions.find((p) => p.id === r.profession)?.name,
          " ",
          r.required,
          " \xB7 ",
          r.readyAt > s.clock ? "\u5237\u65B0\u4E2D " + duration(r.readyAt - s.clock) : r.available ? "\u53EF\u4EE5\u91C7\u96C6" : r.learned ? "\u719F\u7EC3\u5EA6\u4E0D\u8DB3" : "\u5C1A\u672A\u5B66\u4E60"
        ] })
      ] }),
      /* @__PURE__ */ jsx8(Button, { size: "sm", variant: "outline", disabled: locked || !r.available, onClick: () => send({ type: "gatherResource", id: r.id }), children: "\u91C7\u96C6" })
    ] }, r.id)) })
  ] });
}
var colorNames = { red: "\u672A\u89E3\u9501", orange: "\u5FC5\u5B9A\u63D0\u5347", yellow: "\u8F83\u6613\u63D0\u5347", green: "\u5076\u5C14\u63D0\u5347", gray: "\u4E0D\u518D\u63D0\u5347" };
var pageSize = 24;
function Professions({ state: s, data: d, busy, revision, send }) {
  const [selected, setSelected] = useState3("alchemy"), [count, setCount] = useState3(1), [buyMissing, setBuyMissing] = useState3(true), [search, setSearch] = useState3(""), [filter, setFilter] = useState3("\u5168\u90E8"), [page, setPage] = useState3(0);
  const [workshop, setWorkshop] = useState3({ recipes: [], total: 0, page: 0, pageSize }), [workshopError, setWorkshopError] = useState3(""), [workshopLoading, setWorkshopLoading] = useState3(false);
  useEffect(() => {
    const controller = new AbortController(), params = new URLSearchParams({ characterId: s.id, version: d.contentVersion, profession: selected, search, filter, page: String(page), pageSize: String(pageSize) });
    setWorkshopLoading(true);
    setWorkshopError("");
    fetch(`/api/game/workshop?${params}`, { signal: controller.signal }).then(async (response) => {
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(response.status < 500 && typeof result?.error === "string" ? result.error : "\u5DE5\u574A\u62A5\u4EF7\u6682\u65F6\u65E0\u6CD5\u52A0\u8F7D\u3002");
      if (result?.contentVersion !== d.contentVersion || !Array.isArray(result?.recipes) || !Number.isInteger(result?.revision)) throw new Error("\u5DE5\u574A\u62A5\u4EF7\u54CD\u5E94\u4E0D\u5B8C\u6574\u3002");
      return result;
    }).then((result) => {
      if (!controller.signal.aborted) setWorkshop(result);
    }).catch((error) => {
      if (error.name !== "AbortError" && !controller.signal.aborted) setWorkshopError(error.message);
    }).finally(() => {
      if (!controller.signal.aborted) setWorkshopLoading(false);
    });
    return () => controller.abort();
  }, [s.id, selected, search, filter, page, revision, d.contentVersion]);
  const p = d.professions.find((p2) => p2.id === selected), rank = p.nextRank;
  const locked = busy || !!s.combat || !!s.dungeon || !["idle", "hunt"].includes(s.activity.type), valid = Number.isInteger(count) && count >= 1 && count <= 100;
  const recipes = workshop.recipes, pages = Math.max(1, Math.ceil(workshop.total / pageSize)), current = Math.min(page, pages - 1);
  const pagination = /* @__PURE__ */ jsxs7("div", { className: "economy-toolbar recipe-pagination", children: [
    /* @__PURE__ */ jsxs7("small", { children: [
      "\u5171 ",
      workshop.total,
      " \u6761 \xB7 \u7B2C ",
      current + 1,
      " / ",
      pages,
      " \u9875",
      workshopLoading ? " \xB7 \u66F4\u65B0\u4E2D\u2026" : ""
    ] }),
    /* @__PURE__ */ jsx8(Button, { size: "sm", variant: "outline", disabled: current === 0 || workshopLoading, onClick: () => setPage(current - 1), children: "\u4E0A\u4E00\u9875" }),
    /* @__PURE__ */ jsx8(Button, { size: "sm", variant: "outline", disabled: current >= pages - 1 || workshopLoading, onClick: () => setPage(current + 1), children: "\u4E0B\u4E00\u9875" })
  ] });
  return /* @__PURE__ */ jsxs7("div", { className: "economy-layout", children: [
    /* @__PURE__ */ jsxs7("aside", { className: "panel profession-sidebar", children: [
      /* @__PURE__ */ jsx8("div", { className: "eyebrow", children: "\u7ECF\u5178\u65E7\u4E16 \xB7 1\u2014300" }),
      /* @__PURE__ */ jsx8("h2", { children: "\u827E\u6CFD\u62C9\u65AF\u5DE5\u574A" }),
      /* @__PURE__ */ jsxs7("p", { children: [
        "12 \u9879\u804C\u4E1A \xB7 ",
        d.professionRecipeCount,
        " \u6761\u914D\u65B9\u3002\u5305\u542B\u7ECF\u5178\u65E7\u4E16\u5404\u9636\u6BB5\u914D\u65B9\uFF1B",
        s.growthPolicy === "companion" ? "\u961F\u53CB\u6700\u591A\u9009\u62E9\u4E24\u9879\u751F\u6D3B\u804C\u4E1A\uFF0C\u521D\u59CB75\u70B9\u3002" : "\u6BCF\u540D\u89D2\u8272\u6700\u591A\u5B66\u4E60\u4E24\u4E2A\u4E3B\u8981\u4E13\u4E1A\uFF0C\u526F\u804C\u4E1A\u4E0D\u5360\u540D\u989D\u3002"
      ] }),
      /* @__PURE__ */ jsx8("div", { className: "profession-list", children: d.professions.map((x) => /* @__PURE__ */ jsxs7("button", { className: selected === x.id ? "active" : "", onClick: () => {
        setSelected(x.id);
        setPage(0);
        setSearch("");
      }, children: [
        /* @__PURE__ */ jsxs7("span", { children: [
          x.name,
          /* @__PURE__ */ jsx8("small", { children: x.recipeCount ? x.recipeCount + " \u6761\u914D\u65B9" : x.kind })
        ] }),
        /* @__PURE__ */ jsx8("b", { children: x.learned ? `${x.skill} / ${x.cap}` : "\u672A\u5B66\u4E60" })
      ] }, x.id)) })
    ] }),
    /* @__PURE__ */ jsxs7("div", { className: "economy-main", children: [
      /* @__PURE__ */ jsxs7("section", { className: "panel", children: [
        /* @__PURE__ */ jsxs7("div", { className: "section-heading", children: [
          /* @__PURE__ */ jsxs7("div", { children: [
            /* @__PURE__ */ jsx8("div", { className: "eyebrow", children: p.kind }),
            /* @__PURE__ */ jsx8("h2", { children: p.name })
          ] }),
          p.learned && /* @__PURE__ */ jsxs7("span", { className: "skill-number", children: [
            p.skill,
            " / ",
            p.cap
          ] })
        ] }),
        /* @__PURE__ */ jsx8("p", { children: p.description }),
        p.learned && /* @__PURE__ */ jsx8("div", { className: "profession-progress", children: /* @__PURE__ */ jsx8("span", { style: { width: p.skill / p.cap * 100 + "%" } }) }),
        rank ? /* @__PURE__ */ jsxs7("div", { className: "action-row", children: [
          /* @__PURE__ */ jsxs7("small", { children: [
            rank.name,
            " \xB7 \u4E0A\u9650 ",
            rank.cap,
            " \xB7 \u9700\u8981\u7B49\u7EA7 ",
            rank.level,
            "\u3001\u719F\u7EC3\u5EA6 ",
            rank.skill,
            !d.canTrainProfession ? " \xB7 \u8BF7\u524D\u5F80\u57CE\u9547" : ""
          ] }),
          /* @__PURE__ */ jsxs7(Button, { size: "sm", disabled: locked || !p.learned && s.growthPolicy === "companion" && Object.keys(s.professions).length >= 2 || !d.canTrainProfession || (p.skill || 0) < rank.skill || s.level < rank.level || s.money < rank.cost, onClick: () => send({ type: p.learned ? "upgradeProfession" : "learnProfession", id: p.id }), children: [
            p.learned ? "\u8FDB\u9636" : "\u5B66\u4E60",
            " \xB7 ",
            money(rank.cost)
          ] })
        ] }) : /* @__PURE__ */ jsx8("p", { children: "\u5927\u5E08\u7EA7 \xB7 \u719F\u7EC3\u5EA6\u4E0A\u9650 300" }),
        !!p.specializations.length && /* @__PURE__ */ jsxs7("div", { className: "economy-callout", children: [
          /* @__PURE__ */ jsx8("h3", { children: "\u4E13\u4E1A\u4E13\u7CBE" }),
          /* @__PURE__ */ jsxs7("p", { children: [
            "\u5F53\u524D\uFF1A",
            p.specializations.find((x) => x.id === p.specialization)?.name || "\u672A\u9009\u62E9",
            "\u3002\u521D\u6B21\u514D\u8D39\uFF0C\u91CD\u9009\u82B1\u8D39 5 \u91D1\uFF1B\u6B66\u5668\u953B\u9020\u53EF\u8FDB\u4E00\u6B65\u9009\u62E9\u6B66\u5668\u5927\u5E08\u3002"
          ] }),
          /* @__PURE__ */ jsx8("div", { className: "specialization-list", children: p.specializations.map((x) => /* @__PURE__ */ jsxs7(Button, { size: "sm", variant: "outline", disabled: locked || !d.canTrainProfession || !p.learned || p.skill < x.skill || s.level < x.level || p.specialization === x.id || !!x.parent && p.specialization !== x.parent && !p.specializations.some((y) => y.id === p.specialization && y.parent === x.parent) || !!p.specialization && s.money < 5e4, onClick: () => send({ type: "specializeProfession", id: x.id }), children: [
            x.name,
            " \xB7 ",
            x.skill,
            " / \u7B49\u7EA7 ",
            x.level
          ] }, x.id)) })
        ] }),
        p.id === "skinning" && /* @__PURE__ */ jsx8("p", { children: "\u5B66\u4E60\u540E\u81EA\u52A8\u5904\u7406\u51FB\u6740\u7684\u91CE\u517D\uFF1B\u9AD8\u7B49\u7EA7\u91CE\u517D\u9700\u8981\u66F4\u9AD8\u719F\u7EC3\u5EA6\u3002\u8F7B\u76AE\u81F3\u786C\u7532\u76AE\u5747\u5DF2\u7EB3\u5165\u6750\u6599\u76EE\u5F55\uFF0C\u5F53\u524D\u5730\u56FE\u4FDD\u6301\u539F\u6709\u8D44\u6E90\u3002" }),
        p.id === "enchanting" && /* @__PURE__ */ jsxs7("div", { className: "economy-callout", children: [
          /* @__PURE__ */ jsx8("h3", { children: "\u88C5\u5907\u5206\u89E3" }),
          /* @__PURE__ */ jsx8("p", { children: "\u6309\u7ECF\u5178\u65E7\u4E16\u7269\u54C1\u7684\u5206\u89E3\u8868\u4EA7\u51FA\u5C18\u3001\u7CBE\u534E\u3001\u788E\u7247\u4E0E\u6C34\u6676\u3002\u4E00\u952E\u5206\u89E3\u4EC5\u5904\u7406\u80CC\u5305\u4E2D\u7684\u7EFF\u8272\u3001\u84DD\u8272\u88C5\u5907\uFF1B\u9501\u5B9A\u3001\u4EFB\u52A1\u548C\u5DF2\u88C5\u5907\u7269\u54C1\u53D7\u4FDD\u62A4\u3002\u6EE1\u5305\u4EA7\u7269\u4FDD\u7559\u4E3A\u5F85\u62FE\u53D6\u6218\u5229\u54C1\u3002" }),
          /* @__PURE__ */ jsxs7(Button, { variant: "outline", disabled: locked || !d.disenchantable.length, onClick: () => send({ type: "disenchantAll" }), children: [
            "\u4E00\u952E\u5206\u89E3 ",
            d.disenchantable.length,
            " \u4EF6\u88C5\u5907"
          ] })
        ] })
      ] }),
      p.recipeCount > 0 ? /* @__PURE__ */ jsxs7("section", { className: "panel", children: [
        /* @__PURE__ */ jsxs7("div", { className: "section-heading", children: [
          /* @__PURE__ */ jsxs7("h2", { children: [
            "\u914D\u65B9\u5236\u9020 ",
            /* @__PURE__ */ jsxs7("small", { children: [
              p.recipeCount,
              " \u6761"
            ] })
          ] }),
          /* @__PURE__ */ jsx8("input", { "aria-label": "\u641C\u7D22\u914D\u65B9", placeholder: "\u4E2D\u6587\u3001\u82F1\u6587\u6216\u914D\u65B9\u7F16\u53F7\u2026", value: search, onChange: (e) => {
            setSearch(e.target.value);
            setPage(0);
          } })
        ] }),
        /* @__PURE__ */ jsxs7("div", { className: "economy-toolbar", children: [
          /* @__PURE__ */ jsx8("select", { "aria-label": "\u7B5B\u9009\u914D\u65B9", value: filter, onChange: (e) => {
            setFilter(e.target.value);
            setPage(0);
          }, children: ["\u5168\u90E8", "\u5DF2\u89E3\u9501", "\u53EF\u63D0\u5347", "\u4E13\u7CBE\u914D\u65B9", "\u51B7\u5374\u914D\u65B9"].map((x) => /* @__PURE__ */ jsx8("option", { children: x }, x)) }),
          /* @__PURE__ */ jsxs7("label", { children: [
            "\u5236\u9020\u6B21\u6570 ",
            /* @__PURE__ */ jsx8("input", { "aria-label": "\u5236\u9020\u6B21\u6570", type: "number", min: 1, max: 100, value: count, onChange: (e) => setCount(Number(e.target.value)) })
          ] }),
          /* @__PURE__ */ jsxs7("label", { children: [
            /* @__PURE__ */ jsx8("input", { type: "checkbox", checked: buyMissing, onChange: (e) => setBuyMissing(e.target.checked) }),
            " \u62CD\u5356\u884C\u81EA\u52A8\u8865\u9F50\u6750\u6599\u4E0E\u5DE5\u5177"
          ] })
        ] }),
        /* @__PURE__ */ jsx8("p", { children: "\u8FBE\u5230\u719F\u7EC3\u5EA6\u540E\u81EA\u52A8\u89E3\u9501\u3002\u4F18\u5148\u6D88\u8017\u80CC\u5305\u5185\u672A\u9501\u5B9A\u6750\u6599\uFF0C\u5DE5\u5177\u4FDD\u7559\uFF1B\u94F6\u884C\u6750\u6599\u9700\u5148\u53D6\u51FA\u3002\u6709\u51B7\u5374\u7684\u914D\u65B9\u6BCF\u6B21\u5236\u9020\u4E00\u6B21\u3002\u9700\u8981\u7194\u7089\u3001\u94C1\u7827\u3001\u6708\u4EAE\u4E95\u7B49\u8BBE\u65BD\u65F6\uFF0C\u8BF7\u5230\u57CE\u9547\u5DE5\u574A\u3002" }),
        pagination,
        workshopError && /* @__PURE__ */ jsx8("p", { className: "error", role: "alert", children: workshopError }),
        /* @__PURE__ */ jsx8("div", { className: "recipe-list", children: recipes.map((r) => {
          const cost = r.materials.reduce((n, m) => n + Math.max(0, m.count * count - m.have) * m.price, 0) + r.tools.filter((t) => !t.have).reduce((n, t) => n + t.price, 0);
          const cooldown = r.readyAt > s.clock, reason = !r.known ? "\u719F\u7EC3\u5EA6\u6216\u4E13\u7CBE\u4E0D\u8DB3" : !r.facilityReady ? "\u9700\u8981\u57CE\u9547\u5DE5\u574A" : cooldown ? "\u51B7\u5374\u4E2D" : r.cooldown && count !== 1 ? "\u6BCF\u6B21\u9650\u5236\u9020\u4E00\u6B21" : "";
          return /* @__PURE__ */ jsxs7("article", { className: "recipe-card " + (!r.known ? "recipe-locked" : ""), children: [
            /* @__PURE__ */ jsxs7("div", { className: "recipe-title", children: [
              /* @__PURE__ */ jsx8(Icon, { src: d.items[r.item]?.icon, name: r.name }),
              /* @__PURE__ */ jsxs7("div", { children: [
                /* @__PURE__ */ jsx8("h3", { children: r.name }),
                /* @__PURE__ */ jsxs7("small", { children: [
                  "\u9700\u8981 ",
                  p.name,
                  " ",
                  r.skill,
                  " \xB7 \u4EA7\u51FA \xD7",
                  r.output * (valid ? count : 1),
                  r.outputMax > r.output ? "\u2014" + r.outputMax * (valid ? count : 1) : "",
                  " ",
                  /* @__PURE__ */ jsx8("span", { className: "skill-color skill-" + r.color, children: colorNames[r.color] })
                ] })
              ] })
            ] }),
            /* @__PURE__ */ jsxs7("p", { className: "recipe-source", children: [
              "\u539F\u59CB\u6765\u6E90\uFF1A",
              r.source,
              r.specialization ? " \xB7 " + p.specializations.find((x) => x.id === r.specialization)?.name : "",
              r.cooldown ? " \xB7 \u5236\u9020\u51B7\u5374 " + duration(r.cooldown) : "",
              cooldown ? " \xB7 \u5269\u4F59 " + duration(r.readyAt - s.clock) : ""
            ] }),
            d.items[r.item]?.description && /* @__PURE__ */ jsx8("p", { className: "enchant-text", children: d.items[r.item].description }),
            /* @__PURE__ */ jsx8("div", { className: "recipe-materials", children: r.materials.map((m) => /* @__PURE__ */ jsxs7("span", { className: m.have < m.count * count ? "material-missing" : "", children: [
              d.items[m.id]?.name,
              " ",
              /* @__PURE__ */ jsxs7("b", { children: [
                m.have,
                " / ",
                m.count * (valid ? count : 1)
              ] }),
              m.bank > 0 && /* @__PURE__ */ jsxs7("small", { children: [
                "\u94F6\u884C ",
                m.bank
              ] })
            ] }, m.id)) }),
            !!r.tools.length && /* @__PURE__ */ jsxs7("p", { className: "recipe-tools", children: [
              "\u5DE5\u5177\uFF08\u4E0D\u6D88\u8017\uFF09\uFF1A",
              r.tools.map((t) => /* @__PURE__ */ jsxs7("span", { className: t.have ? "" : "material-missing", children: [
                d.items[t.id]?.name,
                " ",
                t.have ? "\u2713" : "\u9700\u8865\u8D2D",
                "\u3000"
              ] }, t.id))
            ] }),
            /* @__PURE__ */ jsxs7("div", { className: "recipe-actions", children: [
              /* @__PURE__ */ jsxs7("small", { children: [
                "\u8865\u8D2D\u5408\u8BA1\uFF1A",
                money(valid ? cost : 0)
              ] }),
              /* @__PURE__ */ jsx8(Button, { size: "sm", variant: "outline", disabled: locked || !valid || !r.known || cost === 0 || s.money < cost, onClick: () => send({ type: "buyMaterials", id: r.id, count }), children: "\u4E00\u952E\u8865\u9F50" }),
              /* @__PURE__ */ jsx8(Button, { size: "sm", disabled: locked || !valid || !!reason || (buyMissing ? s.money < cost : cost > 0), onClick: () => send({ type: "craft", id: r.id, count, buyMissing }), children: reason || (buyMissing && cost > 0 ? "\u8865\u9F50\u5E76\u5236\u9020" : "\u5236\u9020") })
            ] })
          ] }, r.id);
        }) }),
        !recipes.length && !workshopLoading && /* @__PURE__ */ jsx8("p", { className: "empty", children: "\u6CA1\u6709\u5339\u914D\u7684\u914D\u65B9\u3002" }),
        workshop.total > pageSize && pagination
      ] }) : /* @__PURE__ */ jsx8(Gathering, { state: s, data: d, busy, send }),
      /* @__PURE__ */ jsx8("p", { className: "economy-note", children: "\u914D\u65B9\u6750\u6599\u3001\u4EA7\u91CF\u3001\u6280\u80FD\u533A\u95F4\u3001\u5DE5\u5177\u4E0E\u51B7\u5374\u6765\u81EA 1.12 \u8D44\u6599\u3002\u7F8A\u76AE\u7EB8\u3001\u8FDC\u7A0B\u8865\u8D2D\u3001\u81EA\u52A8\u89E3\u9501\u4E0E\u57CE\u9547\u5DE5\u574A\u4E3A\u4FBF\u6377\u89C4\u5219\u3002\u914D\u65B9\u76EE\u5F55\u8986\u76D6\u81F3 60 \u7EA7\uFF0C\u89D2\u8272\u5347\u7EA7\u4E0E\u533A\u57DF\u5730\u56FE\u4ECD\u6CBF\u7528\u5F53\u524D\u5F00\u53D1\u8303\u56F4\u3002" })
    ] })
  ] });
}

// app/city-services.tsx
import { jsx as jsx9, jsxs as jsxs8 } from "react/jsx-runtime";
function CityServicePanel({ service, ...props }) {
  const { state: s, data: d, busy, send } = props;
  const [search, setSearch] = useState4(""), [count, setCount] = useState4(1), [shopMode, setShopMode] = useState4("\u8D2D\u4E70");
  const locked = busy || !d.city?.canInteract;
  const nested = { ...props, busy: locked };
  if (service.id === "bank") return /* @__PURE__ */ jsx9(Bank, { ...nested });
  if (service.id === "auction") return /* @__PURE__ */ jsx9(Auction, { ...nested });
  if (service.id === "professions") return /* @__PURE__ */ jsx9(Professions, { ...nested });
  if (service.id === "trainer") {
    const skills = d.skills.filter((a) => !a.known && (a.name + " " + a.nameEn).toLowerCase().includes(search.toLowerCase()));
    return /* @__PURE__ */ jsxs8("section", { className: "city-service-body", children: [
      /* @__PURE__ */ jsxs8("div", { className: "city-service-toolbar", children: [
        /* @__PURE__ */ jsxs8("div", { children: [
          /* @__PURE__ */ jsxs8("h3", { children: [
            d.className,
            "\u8BAD\u7EC3"
          ] }),
          /* @__PURE__ */ jsxs8("p", { children: [
            "\u53EF\u5B66\u4E60 ",
            d.skills.filter((a) => a.canTrain).length,
            " \u9879 \xB7 \u5F53\u524D\u7B49\u7EA7 ",
            s.level
          ] })
        ] }),
        /* @__PURE__ */ jsx9("input", { "aria-label": "\u641C\u7D22\u4E3B\u57CE\u8BAD\u7EC3\u6280\u80FD", placeholder: "\u641C\u7D22\u6280\u80FD\u2026", value: search, onChange: (e) => setSearch(e.target.value) })
      ] }),
      /* @__PURE__ */ jsxs8("div", { className: "city-stock", children: [
        skills.map((a) => /* @__PURE__ */ jsxs8("div", { className: "city-stock-row", children: [
          /* @__PURE__ */ jsx9(Icon, { src: a.icon, name: a.name }),
          /* @__PURE__ */ jsxs8("div", { className: "grow", children: [
            /* @__PURE__ */ jsxs8("strong", { children: [
              a.name,
              " ",
              /* @__PURE__ */ jsx9("small", { children: a.rank?.replace("Rank", "\u7B49\u7EA7") })
            ] }),
            /* @__PURE__ */ jsxs8("small", { children: [
              "\u9700\u8981\u7B49\u7EA7 ",
              a.requiredLevel,
              " \xB7 ",
              a.canTrain ? "\u53EF\u4EE5\u5B66\u4E60" : a.blockedReason
            ] })
          ] }),
          /* @__PURE__ */ jsxs8(Button, { variant: "outline", disabled: locked || !a.canTrain, onClick: () => send({ type: "train", id: a.spellId }), children: [
            money(a.costCopper || 0),
            " \xB7 \u5B66\u4E60"
          ] })
        ] }, a.spellId)),
        !skills.length && /* @__PURE__ */ jsx9("p", { className: "empty", children: "\u6CA1\u6709\u7B26\u5408\u6761\u4EF6\u7684\u672A\u5B66\u6280\u80FD\u3002" })
      ] }),
      /* @__PURE__ */ jsxs8("div", { className: "city-service-toolbar", children: [
        /* @__PURE__ */ jsxs8("div", { children: [
          /* @__PURE__ */ jsx9("h3", { children: "\u91CD\u65B0\u5206\u914D\u5929\u8D4B" }),
          /* @__PURE__ */ jsx9("p", { children: d.canResetTalents ? "\u6E05\u7A7A\u5DF2\u6295\u5165\u7684\u5929\u8D4B\u70B9\uFF0C\u91CD\u65B0\u89C4\u5212\u6210\u957F\u65B9\u5411\u3002" : d.talentResetBlockedReason })
        ] }),
        /* @__PURE__ */ jsxs8(Button, { variant: "outline", disabled: locked || !d.canResetTalents, onClick: () => send({ type: "resetTalents" }), children: [
          "\u91CD\u7F6E\u5929\u8D4B \xB7 ",
          money(d.talentResetCost)
        ] })
      ] })
    ] });
  }
  if (service.id === "shop") {
    const tabs = /* @__PURE__ */ jsx9("div", { className: "filterbar", "aria-label": "\u5546\u4EBA\u4EA4\u6613", children: ["\u8D2D\u4E70", "\u51FA\u552E"].map((mode) => /* @__PURE__ */ jsx9("button", { className: shopMode === mode ? "active" : "", "aria-pressed": shopMode === mode, onClick: () => setShopMode(mode), children: mode }, mode)) });
    if (shopMode === "\u51FA\u552E") return /* @__PURE__ */ jsxs8("section", { className: "city-service-body", children: [
      tabs,
      /* @__PURE__ */ jsx9(BatchTrade, { ...nested }, s.id + ":" + s.location)
    ] });
    const supplies = /* @__PURE__ */ new Set([159, 117, 2070, 4540, 1179, 1205, 3371, 4496, 4498]);
    const stock = d.shop.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()) || String(i.id) === search).sort((a, b) => Number(supplies.has(b.id)) - Number(supplies.has(a.id)));
    const valid = Number.isInteger(count) && count >= 1 && count <= 20;
    return /* @__PURE__ */ jsxs8("section", { className: "city-service-body", children: [
      tabs,
      /* @__PURE__ */ jsxs8("div", { className: "city-service-toolbar", children: [
        /* @__PURE__ */ jsx9("input", { "aria-label": "\u641C\u7D22\u4E3B\u57CE\u5546\u54C1", placeholder: "\u98DF\u7269\u3001\u996E\u6C34\u3001\u80CC\u5305\u2026", value: search, onChange: (e) => setSearch(e.target.value) }),
        /* @__PURE__ */ jsxs8("label", { children: [
          "\u8D2D\u4E70\u4EFD\u6570 ",
          /* @__PURE__ */ jsx9("input", { "aria-label": "\u4E3B\u57CE\u8D2D\u4E70\u4EFD\u6570", className: "city-quantity", type: "number", min: 1, max: 20, value: count, onChange: (e) => setCount(Number(e.target.value)) })
        ] }),
        /* @__PURE__ */ jsxs8(Button, { variant: "outline", disabled: locked || !d.city.junkCount || !d.shop.length, onClick: () => send({ type: "sellJunk" }), children: [
          "\u51FA\u552E\u7070\u8272\u6742\u7269\uFF08",
          d.city.junkCount,
          " \u7EC4\uFF09"
        ] })
      ] }),
      /* @__PURE__ */ jsx9("p", { children: "\u6BCF\u4EFD\u6570\u91CF\u6807\u5728\u5546\u54C1\u540D\u65C1\uFF1B\u88C5\u5907\u4E0E\u5DF2\u9501\u5B9A\u7269\u54C1\u4E0D\u4F1A\u88AB\u4E00\u952E\u51FA\u552E\u3002" }),
      /* @__PURE__ */ jsxs8("div", { className: "city-stock", children: [
        stock.map((i) => /* @__PURE__ */ jsxs8("div", { className: "city-stock-row", children: [
          /* @__PURE__ */ jsx9(Icon, { src: i.icon, name: i.name }),
          /* @__PURE__ */ jsxs8("div", { className: "grow", children: [
            /* @__PURE__ */ jsx9("strong", { children: i.name }),
            /* @__PURE__ */ jsxs8("small", { children: [
              "\u6BCF\u4EFD \xD7",
              i.count,
              " \xB7 ",
              money(i.price)
            ] })
          ] }),
          /* @__PURE__ */ jsxs8(Button, { variant: "outline", disabled: locked || !valid || s.money < i.price * count, onClick: () => send({ type: "buy", id: i.id, count }), children: [
            valid ? money(i.price * count) : "\u6570\u91CF\u65E0\u6548",
            " \xB7 \u8D2D\u4E70"
          ] })
        ] }, i.id)),
        !stock.length && /* @__PURE__ */ jsx9("p", { className: "empty", children: "\u5F53\u524D\u6CA1\u6709\u7B26\u5408\u6761\u4EF6\u7684\u5546\u54C1\u3002\u8D38\u6613\u533A\u6709\u66F4\u591A\u65E5\u5E38\u8865\u7ED9\u3002" })
      ] })
    ] });
  }
  if (service.id === "inn") return /* @__PURE__ */ jsxs8("section", { className: "city-service-body city-inn", children: [
    s.location === "stormwind" && s.quests[900001] && /* @__PURE__ */ jsxs8("div", { children: [
      /* @__PURE__ */ jsx9("h3", { children: "\u540C\u8DEF\u4EBA \xB7 \u961F\u4F0D\u89E3\u9501" }),
      /* @__PURE__ */ jsx9("p", { children: "\u5965\u91CC\u68EE\uFF1A\u65C5\u9014\u6F2B\u957F\uFF0C\u627E\u51E0\u4F4D\u53EF\u9760\u7684\u4F19\u4F34\u540C\u884C\u5427\u3002\u6211\u53EF\u4EE5\u4E3A\u4F60\u4ECB\u7ECD\u56DB\u4F4D\u5192\u9669\u8005\u3002" }),
      /* @__PURE__ */ jsx9(Button, { disabled: locked, onClick: () => send({ type: "turnin", id: 900001 }), children: "\u4E0E\u65C5\u5E97\u8001\u677F\u4EA4\u8C08 \xB7 \u89E3\u9501\u961F\u4F0D" })
    ] }),
    /* @__PURE__ */ jsxs8("div", { children: [
      /* @__PURE__ */ jsx9("h3", { children: "\u5728\u8FD9\u91CC\u5B89\u5BB6" }),
      /* @__PURE__ */ jsxs8("p", { children: [
        "\u5F53\u524D\u7089\u77F3\u7ED1\u5B9A\uFF1A",
        d.hearthstone.destinationName,
        "\u3002",
        d.hearthstone.remaining > 0 ? `\u51B7\u5374\u5269\u4F59 ${duration(d.hearthstone.remaining)}\u3002` : "\u7089\u77F3\u5DF2\u7ECF\u5C31\u7EEA\u3002",
        "\u91CD\u65B0\u7ED1\u5B9A\u4E0D\u4F1A\u91CD\u7F6E\u51B7\u5374\u3002"
      ] }),
      /* @__PURE__ */ jsx9(Button, { disabled: locked || !d.hearthstone.canBind, onClick: () => send({ type: "bindHearth" }), children: s.hearth === s.location && d.hearthstone.hasItem ? "\u5DF2\u5C06\u8FD9\u91CC\u8BBE\u4E3A\u5BB6" : "\u5C06\u7089\u77F3\u7ED1\u5B9A\u5728\u8FD9\u91CC" })
    ] }),
    /* @__PURE__ */ jsxs8("div", { children: [
      /* @__PURE__ */ jsx9("h3", { children: "\u5728\u51FA\u53D1\u524D\u4F11\u6574" }),
      /* @__PURE__ */ jsx9("p", { children: "\u6309\u7167\u5F53\u524D\u6062\u590D\u8BBE\u7F6E\u4F7F\u7528\u968F\u8EAB\u98DF\u7269\u4E0E\u996E\u6C34\u3002\u6CA1\u6709\u8865\u7ED9\u65F6\uFF0C\u8131\u79BB\u6218\u6597\u4E5F\u4F1A\u81EA\u7136\u6062\u590D\u751F\u547D\u4E0E\u6CD5\u529B\u3002" }),
      /* @__PURE__ */ jsx9(Button, { variant: "outline", disabled: locked, onClick: () => send({ type: "rest" }), children: "\u4F7F\u7528\u8865\u7ED9\u4F11\u606F" })
    ] })
  ] });
  if (service.id === "flight") return /* @__PURE__ */ jsxs8("section", { className: "city-service-body", children: [
    /* @__PURE__ */ jsxs8("div", { className: "city-service-toolbar", children: [
      /* @__PURE__ */ jsxs8("div", { children: [
        /* @__PURE__ */ jsx9("h3", { children: "\u72EE\u9E6B\u5854" }),
        /* @__PURE__ */ jsx9("p", { children: s.flightPoints.includes("stormwind") ? "\u4F60\u5DF2\u7ECF\u638C\u63E1\u4E86\u66B4\u98CE\u57CE\u7684\u98DE\u884C\u8DEF\u7EBF\u3002" : "\u4E0E\u7BA1\u7406\u5458\u4EA4\u8C08\uFF0C\u53D1\u73B0\u66B4\u98CE\u57CE\u98DE\u884C\u70B9\u3002" })
      ] }),
      /* @__PURE__ */ jsx9(Button, { disabled: locked || s.flightPoints.includes("stormwind"), onClick: () => send({ type: "unlockFlight" }), children: s.flightPoints.includes("stormwind") ? "\u98DE\u884C\u70B9\u5DF2\u53D1\u73B0" : "\u53D1\u73B0\u98DE\u884C\u70B9" })
    ] }),
    d.city.flights.map((f) => /* @__PURE__ */ jsxs8("div", { className: "city-stock-row", children: [
      /* @__PURE__ */ jsxs8("div", { className: "grow", children: [
        /* @__PURE__ */ jsx9("strong", { children: f.name }),
        /* @__PURE__ */ jsxs8("small", { children: [
          duration(f.duration),
          " \xB7 ",
          money(f.cost),
          !f.unlocked ? " \xB7 \u9700\u8981\u5148\u53D1\u73B0\u4E24\u7AEF\u98DE\u884C\u70B9" : ""
        ] })
      ] }),
      /* @__PURE__ */ jsx9(Button, { variant: "outline", disabled: locked || !f.unlocked || s.money < f.cost, onClick: () => send({ type: "fly", to: f.to }), children: "\u4E58\u5750\u72EE\u9E6B" })
    ] }, f.to))
  ] });
  if (service.id === "tram") return /* @__PURE__ */ jsxs8("section", { className: "city-service-body", children: [
    /* @__PURE__ */ jsx9("h3", { children: "\u4E0B\u4E00\u7AD9 \xB7 \u94C1\u7089\u5821" }),
    /* @__PURE__ */ jsx9("p", { children: "\u5217\u8F66\u5728\u5730\u4E0B\u7A7F\u884C\uFF0C\u7EA6 3 \u5206\u949F\u62B5\u8FBE\u94C1\u7089\u5821\u4FE1\u4F7F\u9A7F\u7AD9\u3002\u514D\u8D39\u4E58\u5750\uFF0C\u9014\u4E2D\u4E0D\u80FD\u529E\u7406\u57CE\u533A\u670D\u52A1\u3002" }),
    /* @__PURE__ */ jsx9(Button, { disabled: locked, onClick: () => send({ type: "travel", to: "ironforge" }), children: "\u4E58\u5750\u77FF\u9053\u5730\u94C1 \xB7 3 \u5206\u949F" })
  ] });
  return null;
}

// app/creature-portrait.tsx
import { useState as useState5 } from "react";

// ../../packages/game-data/data/npc-models-manifest.json
var npc_models_manifest_default = {
  schemaVersion: 1,
  source: "Archived Classic portraits and local creature_template.ModelId1; Classic CDN static renders",
  copyright: "Blizzard Entertainment artwork; third-party Wowhead hosting. Code license does not relicense artwork.",
  assets: [
    {
      id: "classic-display-38",
      displayId: 38,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-38.webp",
      sha256: "e7d4f6f06e70b37da97739861e1483dad390deccd9655e938e6c103038d38ae5",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-134",
      displayId: 134,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-134.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/134/134.webp",
      sha256: "d6ac9f9eda4daf8c77e2b163872ebfac881784a73409cd34bac95d9893f38592"
    },
    {
      id: "classic-display-137",
      displayId: 137,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-137.webp",
      sha256: "1fec72323468afff95ec9da6b04b47fdd14405ccf3bee61398225b049fd2b18f",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-139",
      displayId: 139,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-139.webp",
      sha256: "9fa761f16723091b83173bb8be94bfff88fe2cc64c50b3bb9a193bdceab8156b",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-146",
      displayId: 146,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-146.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/146/146.webp",
      sha256: "223e1d588bde9f3eafa59efb60f6d19a4abce22c8a95a8775347e3c4b417a9e5"
    },
    {
      id: "classic-display-161",
      displayId: 161,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-161.webp",
      sha256: "8123ffdfa58ff4486bbbfc6188aed51bdfd569fe9ac1e47bfad68f8a5dd309e7",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-163",
      displayId: 163,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-163.webp",
      sha256: "4e3c185c03e3dd13cd6d8c0f1341131aecd898201f7dd1142db26ac1bc5d2384",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-169",
      displayId: 169,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-169.webp",
      sha256: "8afe469663097e74b546a50475568625b78b03baa931ac10e18ccd8431f532bc",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-175",
      displayId: 175,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-175.webp",
      sha256: "50ee2da518f7b908d94fb4c84aca6207a42b6adfa970ccc1d75575fd6b245b05",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-184",
      displayId: 184,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-184.webp",
      sha256: "dd713628e33df4f70877e522477d09e1893b7ef9995f9ce4fc22e9fac8bab95a",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-204",
      displayId: 204,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-204.webp",
      sha256: "2b2b2af32084b47f52c4c83e8e02c3c064c0c7d3a2b3f9b352405434e719efb6",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-221",
      displayId: 221,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-221.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/221/221.webp",
      sha256: "057a4c6e540b769dd2a3bd2b7ea9728e60c3552ff25bc903d1352565f02ce19d"
    },
    {
      id: "classic-display-229",
      displayId: 229,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-229.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/229/229.webp",
      sha256: "be3a893d18c72841200cac721c93cb2d152a41918e22cddfcfb488239817b281"
    },
    {
      id: "classic-display-236",
      displayId: 236,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-236.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/236/236.webp",
      sha256: "3dfa4d1fe09b7b1d0b1887390b863dab764ba9728942fbd7cfb5c1fc7b47b4b2"
    },
    {
      id: "classic-display-246",
      displayId: 246,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-246.webp",
      sha256: "e8b64d213c6bac418e5f7b0025cd146c5c8a86e6ed223b9f7de81ac6a10c1338",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-251",
      displayId: 251,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-251.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/251/251.webp",
      sha256: "3ce544fd88a73d008d1e9b7e3d6081576514a69efd62ba33e608c235ffbcde7b"
    },
    {
      id: "classic-display-252",
      displayId: 252,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-252.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/252/252.webp",
      sha256: "3172be83f2101d4f99d200cc3135b783a14a425d2b199e2b4ab36e7dddb7ed76"
    },
    {
      id: "classic-display-257",
      displayId: 257,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-257.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/1/257.webp",
      sha256: "d5c519a48d785e9035e776911518fa239a9aa5cae666bfb8ebdccf1e9e4c782e"
    },
    {
      id: "classic-display-262",
      displayId: 262,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-262.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/6/262.webp",
      sha256: "44ca87b38c170e543f1f2a8e19ea0d348a8ca13bb9c01b51169fa5e3168426b1"
    },
    {
      id: "classic-display-304",
      displayId: 304,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-304.webp",
      sha256: "84f316900bf641de81d7e4a0a89122b9a8ca2062a91056713e2226a51d78cd4d",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-308",
      displayId: 308,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-308.webp",
      sha256: "6f3883e85e3bc84cc779469c0dd455c169e2f14d17af6f45f1b62799e6b7d35d",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-310",
      displayId: 310,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-310.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/54/310.webp",
      sha256: "cf58657acfbdd1408552b7fc3a7a09b6711a48eca29df239dd0f018f2a25e875"
    },
    {
      id: "classic-display-328",
      displayId: 328,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-328.webp",
      sha256: "7c4bcac0da1353c0fa56da6b2a02f3a2808fd6c9614fc3aa4596429faffa274f",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-338",
      displayId: 338,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-338.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/82/338.webp",
      sha256: "7ad7fae726abdb9f1baa8327f4c85d88bd590eed7956c076516691a5342858cb"
    },
    {
      id: "classic-display-341",
      displayId: 341,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-341.webp",
      sha256: "a4bba5575756eefd66414d649146290ec158940a7646aa895355a1b513564ff1",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-347",
      displayId: 347,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-347.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/91/347.webp",
      sha256: "7d995a9420294ac1032d82d88fca21c54c7578a227b1ed58ab65e88f90540f19"
    },
    {
      id: "classic-display-360",
      displayId: 360,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-360.webp",
      sha256: "8a256701e01ee83a90cea4bfcd1af7008792960d596ff9cf01f9461b4c0736f1",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-365",
      displayId: 365,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-365.webp",
      sha256: "42326c6c7d2d7ae1fd463a97753bfe4aba3e58ea3fbdbac072db04a35cc2bc47",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-367",
      displayId: 367,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-367.webp",
      sha256: "1c77d1b9faeea2a325fddbf7316cb3853570237d700ac7d22304d1c381d3cf76",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-368",
      displayId: 368,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-368.webp",
      sha256: "4a75d8eccb8c0149c3213168a6cb409cfbfe7aa685bd9d413c6e655be0b7f975",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-373",
      displayId: 373,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-373.webp",
      sha256: "4e67aba2cb791de355565e60f5a2272660d406342fbd845d6820b1cefda29e6a",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-374",
      displayId: 374,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-374.webp",
      sha256: "ea8eb1d7dda59db669754f7da30fb5b2d548961760f51aaa128ac63efa944247",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-376",
      displayId: 376,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-376.webp",
      sha256: "06e14de5744d81b08b63c3a6bc4d47283dd320be39d372b7296cfa83cba333ed",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-377",
      displayId: 377,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-377.webp",
      sha256: "b25cf64f0ff0fb8414a181a855f29db1c2f5922af9e042892ee34c8b3a2876d6",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-378",
      displayId: 378,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-378.webp",
      sha256: "0bc47c170ca5b1b52a0b97a1e65e718eae873e6f8f69fd0e0dcf9fceea252d3f",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-379",
      displayId: 379,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-379.webp",
      sha256: "08522057f5b140465eb9ea6e33621579381646fdc742196c075837d528add071",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-380",
      displayId: 380,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-380.webp",
      sha256: "32ad513a4c7a710920d561c88eaf6a524224ea2bc790e20bbf99ae5b5b5ef3f6",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-381",
      displayId: 381,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-381.webp",
      sha256: "675bfa5b1607efb04187b78e091e662b7562506b513336322c370f9e182bc84e",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-382",
      displayId: 382,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-382.webp",
      sha256: "1cd55d20fb0773afaf575821bd808d1c8b6486120813bc285b66a8d0add1d3c9",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-383",
      displayId: 383,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-383.webp",
      sha256: "15233024f1633b73ac013de581517b0f75fd132da21ae3fbf686005dd2462664",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-384",
      displayId: 384,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-384.webp",
      sha256: "7255ca8123e5a5f66e56a37524e298a27ce26d0646a5d53247f3e237b109164a",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-387",
      displayId: 387,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-387.webp",
      sha256: "3f60a9e355580afab4053ac2f313867186456c1895a9878f9a3d3732568162d1",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-389",
      displayId: 389,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-389.webp",
      sha256: "38e9a170ada21449226ef880c14fe4211226719be1670b95912ff2a8a4a87d6d",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-410",
      displayId: 410,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-410.webp",
      sha256: "f91535b553279b04add8b516040e156573e780b0c055afd6ce4e615b997ea57e",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-413",
      displayId: 413,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-413.webp",
      sha256: "b6c4a1511fc53516d7bce6acaac366664518d5d788bd257ebc40d978b802415a",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-441",
      displayId: 441,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-441.webp",
      sha256: "63ec3d7d24009c894c2374b5c04c6ff72f86d9652f735495e89304b164098fd4",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-447",
      displayId: 447,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-447.webp",
      sha256: "eaa189e36ae3c19b31b6a772662866bd3bc287ed5659b05e5df4d643cc304814",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-486",
      displayId: 486,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-486.webp",
      sha256: "e9f97495a5340fff9fb1e4dd7e902c226100bd86a9583aa1f85322f16ded3a86",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-491",
      displayId: 491,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-491.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/235/491.webp",
      sha256: "0ce806b17a186a57f1526ed2e5ba43c8a3667cac2c91cae797cfe1c74a0ab026"
    },
    {
      id: "classic-display-502",
      displayId: 502,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-502.webp",
      sha256: "d709f0c706642078a4e361711b57330e4c35f699fb2c219126bcf490cf5b62ed",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-503",
      displayId: 503,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-503.webp",
      sha256: "f854d2cd7d5bc990fe6298f4c3e5208932d5bccc91dac4e45d72666d41ef0235",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-507",
      displayId: 507,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-507.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/251/507.webp",
      sha256: "ec52043547463f9052b68185c6ee00df737a0a75568e33cc450ce863951dbd0e"
    },
    {
      id: "classic-display-512",
      displayId: 512,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-512.webp",
      sha256: "8bc205a815770924d253014c779cd987e984878f82917a1bfbc60ee71f20a1bb",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-514",
      displayId: 514,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-514.webp",
      sha256: "74eebdaf763b8d0cc340ce9387fb322885a469ce46d29d1f2a05081e0ac85fe1",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-519",
      displayId: 519,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-519.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/7/519.webp",
      sha256: "0257ff89ca1ded6630b8ff02b030c6a0436bbd5e0db5a7e664992bf5dc945490"
    },
    {
      id: "classic-display-527",
      displayId: 527,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-527.webp",
      sha256: "015d3f47df14095ea8341f440d9a630c7fbd8633cde678875a3507e64beb5ca1",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-536",
      displayId: 536,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-536.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/24/536.webp",
      sha256: "d27c6ad8e9d846187c4d1bff5ac1326550cd39aa85c9ecfc930bfbae56b7c65e"
    },
    {
      id: "classic-display-545",
      displayId: 545,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-545.webp",
      sha256: "2a0ee5e9717f5027063df51e5a89f74e6b798ac33af31f4c2afa5c6c65b0f4e1",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-548",
      displayId: 548,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-548.webp",
      sha256: "84fc72479fe6735cd69d3d98c99e86e8526fb2f1c06737d80cd4a9975f711954",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-556",
      displayId: 556,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-556.webp",
      sha256: "770a048a559f8a1158e9f35c679ce50f0bc4277deea977987a770eb45766d6ea",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-569",
      displayId: 569,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-569.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/57/569.webp",
      sha256: "139552a0e52be1033f0f5cfb8cd5796636cfe4ebaa8a98c0ddb93bac473675a9"
    },
    {
      id: "classic-display-570",
      displayId: 570,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-570.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/58/570.webp",
      sha256: "00398aa8bfc6134bd095e76595439b3098dad20dbd1fe1bc785852a19c1ca9f3"
    },
    {
      id: "classic-display-604",
      displayId: 604,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-604.webp",
      sha256: "46cac2d959800c0bc644583e3d99bab876d4e492a68951cdbfc538cd0b129ab7",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-612",
      displayId: 612,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-612.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/100/612.webp",
      sha256: "b85ff325daae994104132f0db41718c021e519034f899b179c1c973f53a76437"
    },
    {
      id: "classic-display-617",
      displayId: 617,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-617.webp",
      sha256: "c64d8d048ab1692b551e369e2190cf88b3776f46eaacef3d064e92e8839ee5c2",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-643",
      displayId: 643,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-643.webp",
      sha256: "59838c86a9763a53b2424c54c285f76eaf785c2af9a3599452e38439f5e127fe",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-646",
      displayId: 646,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-646.webp",
      sha256: "0b65b882521468ede549316e06733f9ec7751ed050059231f29570c2ad927640",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-652",
      displayId: 652,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-652.webp",
      sha256: "f3a68e23251560527801ab0fe63d6085c0b2504f464501a0f0483519baaad1d5",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-654",
      displayId: 654,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-654.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/142/654.webp",
      sha256: "a02ef4bc178ea28644abc03c846baf5d3c9326ea111fb0fc908477b65aa11b71"
    },
    {
      id: "classic-display-657",
      displayId: 657,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-657.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/145/657.webp",
      sha256: "1d471a1c59e6584ee190da2caa23655cca361709c85cdc2e3169a10f6f41d41f"
    },
    {
      id: "classic-display-670",
      displayId: 670,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-670.webp",
      sha256: "08e0c9f3d8c2ab6c462c92b4808fb0e399bb92ab7d7f7b33f1fa6740804d7871",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-713",
      displayId: 713,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-713.webp",
      sha256: "5844b17caf92c5e65e92f9d01c17b08f903dd2ad5cd4bab2e15380caf98f8671",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-734",
      displayId: 734,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-734.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/222/734.webp",
      sha256: "bb3d506738038da83ad7e4cfaf08b15810f5ca13f389b56f67da683aaa719e23"
    },
    {
      id: "classic-display-741",
      displayId: 741,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-741.webp",
      sha256: "f6e1a9ab3b48f459f8820a9c807013f25c5c0d0d209a86462c0b0a83c1a139cd",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-748",
      displayId: 748,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-748.webp",
      sha256: "4447bd1babbe5757943845e680a52ac5a64090c915ae28987a4ae52f5d24e202",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-757",
      displayId: 757,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-757.webp",
      sha256: "8206d2b2b468cf356650e37f8256e71a6d346f50666f8a138c2609f3ea96b4c0",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-774",
      displayId: 774,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-774.webp",
      sha256: "b7d137614822ad4eff515fc0c6c337bca1cc04f05d96428778f822ada6869a6f",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-801",
      displayId: 801,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-801.webp",
      sha256: "4f67472fe082bbe6ad272264a4a8791332d3a6b356944a0297cf4266e066b807",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-802",
      displayId: 802,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-802.webp",
      sha256: "f142f8a903842af4cc6b3eaf77ae86d0ce205bef53e889eed7cfa5bcd433d87d",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-829",
      displayId: 829,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-829.webp",
      sha256: "c8c4bbb2ae71b0c53434cf89a7411e752a69d5f27824bc2bc2992fe238c26920",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-850",
      displayId: 850,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-850.webp",
      sha256: "4523f977d527778f57314376e134a1257646de1d9fa9d76b0a19518a4f0e227d",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-856",
      displayId: 856,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-856.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/88/856.webp",
      sha256: "0270999842089498393b943b4cb7b62bd52603712e338fab5980aca7f5aeea2e"
    },
    {
      id: "classic-display-863",
      displayId: 863,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-863.webp",
      sha256: "b19d2450261625196e508baade88a9bc74e83c8dcc2b39d19c7251f3d1e625c7",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-903",
      displayId: 903,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-903.webp",
      sha256: "578a7b5799c6a402f6e50674b4b907601c935b3532c94ac400486623af4b3cef",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-955",
      displayId: 955,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-955.webp",
      sha256: "4dd0e1b2d762e13fa21a6acd9f6e0c151c2423c9ccc15353167b40984af1f0f4",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-958",
      displayId: 958,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-958.webp",
      sha256: "4ba855a1c20a4afef2331b25ac4dea2d4eab91e4759450b76617af306facf91d",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-979",
      displayId: 979,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-979.webp",
      sha256: "15ed94da3509050a9ef3d5e4f5b6e47663e20ac15d402555af9d95b4a4fcc39a",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-983",
      displayId: 983,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-983.webp",
      sha256: "43c093242d9f1007d8e45523b38bba7a2db5eca6bb6ab967d1b214df7056bd73",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-987",
      displayId: 987,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-987.webp",
      sha256: "c3ae50b4600a9f6b2d68949df461fddd47f3a91706d033e6cf427021e83653f5",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-1006",
      displayId: 1006,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1006.webp",
      sha256: "608390a3759299c8b1abe789038a88139205b9211ec7dcb8eb41e1410d92a5ea",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-1036",
      displayId: 1036,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1036.webp",
      sha256: "b569bdca26f2d0b0c014fbe8aff747c3b9921937b9053cea51856a7eb6b3d841",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-1060",
      displayId: 1060,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1060.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/36/1060.webp",
      sha256: "23380ee51858faae93b67f09a8e59e9b31c653bda430f9d4a6dfd5d8daaf2217"
    },
    {
      id: "classic-display-1065",
      displayId: 1065,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1065.webp",
      sha256: "406258c47ffac68157ebbb1b691370508314a693be9763c25063d23f5f547940",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-1072",
      displayId: 1072,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1072.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/48/1072.webp",
      sha256: "d03be6347d3b5dfb96fe20e146414415fa3dc275cac49a3dad41261311b1fc75"
    },
    {
      id: "classic-display-1079",
      displayId: 1079,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1079.webp",
      sha256: "f90640204ba0230a31a5c893262ee03ccefb8b4e9339f38130de9936760aaa60",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-1105",
      displayId: 1105,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1105.webp",
      sha256: "d7a21e909fc7c3aa5fc7b817e13cb06fc296144ca004004487feefed8e16fe61",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-1132",
      displayId: 1132,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1132.webp",
      sha256: "05d67de89d5da3f0e28bcd39371266bd02d376377099825ba4143dff9ed9ecc4",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-1141",
      displayId: 1141,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1141.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/117/1141.webp",
      sha256: "f037f7f9470c83190d6d7bdca0dc8200bcf9d030cc11d6317ae8f6014c7022bb"
    },
    {
      id: "classic-display-1159",
      displayId: 1159,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1159.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/135/1159.webp",
      sha256: "f32c3d942f3f08997d905f7d88ce844b5314e3758c1b3e1d9744970d068fee93"
    },
    {
      id: "classic-display-1194",
      displayId: 1194,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1194.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/170/1194.webp",
      sha256: "8847cbe5edbc694e6bc5a96212e8dec7051c86841e79e31839b0eea3e46d9212"
    },
    {
      id: "classic-display-1206",
      displayId: 1206,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1206.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/182/1206.webp",
      sha256: "c2fbc025ee143dbd6c98ed4f56c833c426e15939375b47a75e8b8c9ac26e3642"
    },
    {
      id: "classic-display-1269",
      displayId: 1269,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1269.webp",
      sha256: "cfd9db2f171fa32f2cf7aad2ef4be74fbf6a0a774fc9f33eba9623f5a8d1f802",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-1279",
      displayId: 1279,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1279.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/255/1279.webp",
      sha256: "f79e3dd12305b56d40e02f13e7a4dae3dda01e0b807455998617ca6d34d80f90"
    },
    {
      id: "classic-display-1287",
      displayId: 1287,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1287.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/7/1287.webp",
      sha256: "c0bfd197beace6270b5f48eecf0ac3cd558411b51a9d119f729e63118b5f39ef"
    },
    {
      id: "classic-display-1288",
      displayId: 1288,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1288.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/8/1288.webp",
      sha256: "29fc3ee3c360069067d27c443f03b813d2af9da339ac13bc10a5bc93917ef4e5"
    },
    {
      id: "classic-display-1289",
      displayId: 1289,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1289.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/9/1289.webp",
      sha256: "9959f3a94b2c58e52cfea5c16659393083f78d02e32537ab2ed01a1663ac8944"
    },
    {
      id: "classic-display-1290",
      displayId: 1290,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1290.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/10/1290.webp",
      sha256: "0f8c53df7d48a6dfb274adc8b6e4d78b81508532550509ff3623882d415e98d7"
    },
    {
      id: "classic-display-1291",
      displayId: 1291,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1291.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/11/1291.webp",
      sha256: "ec78eec3d51d2d089f133f8347021798b503989640fd9775f2845547db57ca4d"
    },
    {
      id: "classic-display-1292",
      displayId: 1292,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1292.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/12/1292.webp",
      sha256: "83535b62a6e6d08dad107342307629afdbced20bff07f34e56fa80dccf1fd8a4"
    },
    {
      id: "classic-display-1293",
      displayId: 1293,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1293.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/13/1293.webp",
      sha256: "39cbcb7616069836a140fff591d25922ff86f81326e28ae38900b8a571307ade"
    },
    {
      id: "classic-display-1294",
      displayId: 1294,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1294.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/14/1294.webp",
      sha256: "64e19b3dc13af782d77ae1a07fa4a9ab69a71db7fa2ee8917956b535a721122c"
    },
    {
      id: "classic-display-1295",
      displayId: 1295,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1295.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/15/1295.webp",
      sha256: "8cd0987861577a8e8c70d4df12f54edb3bb6f34cbfdce7859a3eadd24422c683"
    },
    {
      id: "classic-display-1296",
      displayId: 1296,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1296.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/16/1296.webp",
      sha256: "2d7e71063bb31c6a942ba3046e418862affd41618810af251915183be3b8d5f8"
    },
    {
      id: "classic-display-1297",
      displayId: 1297,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1297.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/17/1297.webp",
      sha256: "cf0b190fd59817dfe6f6396dffa4f2069f3b3a7d20af805b1f8414fc0f555d18"
    },
    {
      id: "classic-display-1298",
      displayId: 1298,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1298.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/18/1298.webp",
      sha256: "e8a47ada0cad361a896af3d5a01c78b5baa0a281c57754f5711b0e943b790010"
    },
    {
      id: "classic-display-1299",
      displayId: 1299,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1299.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/19/1299.webp",
      sha256: "1d5881aadd7f35f4e5663321aa9d02efa17b259792e0279e8daa52759fa93f1b"
    },
    {
      id: "classic-display-1300",
      displayId: 1300,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1300.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/20/1300.webp",
      sha256: "187ffcbd46ad52f4c8e55f56b5b695c9c0c0a969b4fa3fce98d729f28a0ccd21"
    },
    {
      id: "classic-display-1305",
      displayId: 1305,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1305.webp",
      sha256: "d60f43c68ad45bfa714910f0938a58465c479b75312706fee99511a4e1c89c7a",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-1357",
      displayId: 1357,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1357.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/77/1357.webp",
      sha256: "955f60b2eb64b7df24de881075fef02abb48a7aab338d89085ae82df0735af60"
    },
    {
      id: "classic-display-1423",
      displayId: 1423,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1423.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/143/1423.webp",
      sha256: "6a90c428a3f03a56ff7f874ecbb85b99aeec709cc0c7ab9d80da89b1c133ad04"
    },
    {
      id: "classic-display-1425",
      displayId: 1425,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1425.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/145/1425.webp",
      sha256: "397b819cddb83825b95ba15ec225c33157d2a0db77a3e877eead07f9db1dee89"
    },
    {
      id: "classic-display-1427",
      displayId: 1427,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1427.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/147/1427.webp",
      sha256: "5257d10e438223cc892065bdac03ae1a74b8a877bf46c668a3b04dd33581bc95"
    },
    {
      id: "classic-display-1429",
      displayId: 1429,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1429.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/149/1429.webp",
      sha256: "99f06106dfb2c9c46a641222f7464386469289de24e17d324c7a9f5b9842c5c9"
    },
    {
      id: "classic-display-1431",
      displayId: 1431,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1431.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/151/1431.webp",
      sha256: "baab3a18b73372b3073574db0b381e472164a18737518a77c932ae64cb751349"
    },
    {
      id: "classic-display-1432",
      displayId: 1432,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1432.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/152/1432.webp",
      sha256: "2d0c98c831d6f561260a17b53869b614cfdb75adbb6a562f3d6ade6e546c2d2a"
    },
    {
      id: "classic-display-1433",
      displayId: 1433,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1433.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/153/1433.webp",
      sha256: "4acc4cbe18f840eb49b82379813879f4f75174f07e1001207cb5ade663df31f7"
    },
    {
      id: "classic-display-1434",
      displayId: 1434,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1434.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/154/1434.webp",
      sha256: "157039e03d87148f712becd0517464f9e9e4998c21b7526048996cc76408b2f9"
    },
    {
      id: "classic-display-1436",
      displayId: 1436,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1436.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/156/1436.webp",
      sha256: "8afa44aed5caa40f80ba851f420e947be1021662f7af6625eb39cc2a8ffcdd9e"
    },
    {
      id: "classic-display-1437",
      displayId: 1437,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1437.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/157/1437.webp",
      sha256: "834a9884f7c2d1b67d0e2ab5a6eae2d77c7bfcc35780cfccb6b1e4e82f979a8c"
    },
    {
      id: "classic-display-1438",
      displayId: 1438,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1438.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/158/1438.webp",
      sha256: "5e053895d02919bb5c9cceca4b06bd76da2416ba333f662d57baaaed61514d9c"
    },
    {
      id: "classic-display-1439",
      displayId: 1439,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1439.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/159/1439.webp",
      sha256: "210a97684fb63846ef48039c451ee2a9f38984240fa34697331d53303f70e763"
    },
    {
      id: "classic-display-1440",
      displayId: 1440,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1440.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/160/1440.webp",
      sha256: "74565f68cd432ff3e0721f467c76386bf809a1683d2cf4ecfa9c63fa1b821c32"
    },
    {
      id: "classic-display-1441",
      displayId: 1441,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1441.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/161/1441.webp",
      sha256: "2c0dc535419014ac7394364a406d3de98c6a5f2c6fddb95721f85166f26aaf80"
    },
    {
      id: "classic-display-1443",
      displayId: 1443,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1443.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/163/1443.webp",
      sha256: "97bd9f102bfde9a378164050e762baf21d84031c3390cd8d970641dc5346529c"
    },
    {
      id: "classic-display-1444",
      displayId: 1444,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1444.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/164/1444.webp",
      sha256: "c16fd726c1ec7289efed990152df9f0b799018292abce2e27831dc1ed02a1add"
    },
    {
      id: "classic-display-1445",
      displayId: 1445,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1445.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/165/1445.webp",
      sha256: "e366fc5bd38f521fea8986b18793ed92ecfbd73cc59875becf4d4568811b1025"
    },
    {
      id: "classic-display-1446",
      displayId: 1446,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1446.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/166/1446.webp",
      sha256: "da5d0100c845af3332ebdf215e56f8888a5951aa519b1de19e398ed601a30141"
    },
    {
      id: "classic-display-1447",
      displayId: 1447,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1447.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/167/1447.webp",
      sha256: "03eff554cfd9d8dd5363b60b42f9d2f0ad15cbec96cff70b39e309ef5005f97e"
    },
    {
      id: "classic-display-1448",
      displayId: 1448,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1448.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/168/1448.webp",
      sha256: "84dc397f10f437351c56ce253eb741af250fe5c7cc23b910286c79e33ad30443"
    },
    {
      id: "classic-display-1449",
      displayId: 1449,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1449.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/169/1449.webp",
      sha256: "4a7589488985bd7e9ad755e8974cdee418d9b5a8e448de72b9ee4bed4473ed47"
    },
    {
      id: "classic-display-1450",
      displayId: 1450,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1450.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/170/1450.webp",
      sha256: "23f0f878050fd16dab5ac14b6bdb0212fe491576232be2be6dce5176fc5b4f5b"
    },
    {
      id: "classic-display-1469",
      displayId: 1469,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1469.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/189/1469.webp",
      sha256: "ed719ef37ec0f323929bf14983b21079860adb8ced5debc04060f36419ca0942"
    },
    {
      id: "classic-display-1470",
      displayId: 1470,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1470.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/190/1470.webp",
      sha256: "e5782e84445f1e036937bc242b373f459a6dc2a28ded82bac047a466128632a4"
    },
    {
      id: "classic-display-1471",
      displayId: 1471,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1471.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/191/1471.webp",
      sha256: "6a170d4e53cbe666831d172a6b469c00e768dc7099cc8c64e936968f99a8eba9"
    },
    {
      id: "classic-display-1472",
      displayId: 1472,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1472.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/192/1472.webp",
      sha256: "8ec37fdb82ade811cd2fe63f1249102c5cddfadb5c0d7f900a11d6d6965ed092"
    },
    {
      id: "classic-display-1473",
      displayId: 1473,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1473.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/193/1473.webp",
      sha256: "dd1b4c5c119ec83eb9901ecb38d61faf5007e0440eea6341ea49f54af16e196f"
    },
    {
      id: "classic-display-1477",
      displayId: 1477,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1477.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/197/1477.webp",
      sha256: "ad6aedf2473c2c8f000ad99065d367fa01633281127fe18f3cc77032a978f6a9"
    },
    {
      id: "classic-display-1480",
      displayId: 1480,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1480.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/200/1480.webp",
      sha256: "bc4de1f1a3359f440124265b9957c33ae1aabad3d8f24f9cfde91c731737f8f0"
    },
    {
      id: "classic-display-1481",
      displayId: 1481,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1481.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/201/1481.webp",
      sha256: "54f5e571e208e228b3c4db1b823b33621ec98bd78059e0834bfa1212686cf89f"
    },
    {
      id: "classic-display-1482",
      displayId: 1482,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1482.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/202/1482.webp",
      sha256: "21c59da87f17e7560e376afa2e58f76ae3cba668923f83933da1d4cb29fdcacf"
    },
    {
      id: "classic-display-1483",
      displayId: 1483,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1483.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/203/1483.webp",
      sha256: "b48d4bb77f9c91a489fbe8cf1678e4acfccdd2b4a5f7a99d5ff92c989d7ec4cf"
    },
    {
      id: "classic-display-1484",
      displayId: 1484,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1484.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/204/1484.webp",
      sha256: "037fa8191b3abb0acc2eb28666f6a89415079b9d47459d50a173f2ffd5c86749"
    },
    {
      id: "classic-display-1485",
      displayId: 1485,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1485.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/205/1485.webp",
      sha256: "901f8bee1af727540475b6b28c9f11cf65b9f7b5358af193511d0280dd1938d6"
    },
    {
      id: "classic-display-1486",
      displayId: 1486,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1486.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/206/1486.webp",
      sha256: "940933a1576f8868c31a768717883f2ef8d674c9b162f0f3b0d6f32ae16ade84"
    },
    {
      id: "classic-display-1487",
      displayId: 1487,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1487.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/207/1487.webp",
      sha256: "b41b581b198228bbda0735c7a449d7743ac1ad18b106f09c57777c1457bd606d"
    },
    {
      id: "classic-display-1488",
      displayId: 1488,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1488.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/208/1488.webp",
      sha256: "06fd28229cbbfacfab2c89ccaf3484710dcdee2c3adf3ca21b207aafd9ff75e1"
    },
    {
      id: "classic-display-1489",
      displayId: 1489,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1489.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/209/1489.webp",
      sha256: "1f943bcf94bf429fe2f6642aafd4f3fe6d446c30e5e1f82ca4b3ee5518d358aa"
    },
    {
      id: "classic-display-1490",
      displayId: 1490,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1490.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/210/1490.webp",
      sha256: "37553254a5a1b23ea3ea7d0329674a94b75afe491b5736718b3995883d50017f"
    },
    {
      id: "classic-display-1491",
      displayId: 1491,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1491.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/211/1491.webp",
      sha256: "ddc9ba518cc6eddb4597080363de2d42f5822cfd9f532a37dffb9dbe7d34c4da"
    },
    {
      id: "classic-display-1492",
      displayId: 1492,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1492.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/212/1492.webp",
      sha256: "745df2444f238fe9e85f04d4daa36914192834983789d83aa3eb7748dfc48282"
    },
    {
      id: "classic-display-1494",
      displayId: 1494,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1494.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/214/1494.webp",
      sha256: "482c6d89c78a97368aa2a351a5e5a7dcdd47231041e148c4df8841bd4ad1636a"
    },
    {
      id: "classic-display-1495",
      displayId: 1495,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1495.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/215/1495.webp",
      sha256: "a3fbd4cbd8166421103d86d218dd3391d3548ae1a56148cb0200b45c70ec6702"
    },
    {
      id: "classic-display-1496",
      displayId: 1496,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1496.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/216/1496.webp",
      sha256: "9b035e9e0ad3b2548fcd542451d885a8936948a7af7104a8772d291cad037d1c"
    },
    {
      id: "classic-display-1497",
      displayId: 1497,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1497.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/217/1497.webp",
      sha256: "da14f55e3c7f2305846b6484e29ea15e3b3761c8658ab679aaebf50d20da8ce0"
    },
    {
      id: "classic-display-1498",
      displayId: 1498,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1498.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/218/1498.webp",
      sha256: "4e0028a9b93008278188285a9865488099114200f75e380095a3cdb21c483731"
    },
    {
      id: "classic-display-1499",
      displayId: 1499,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1499.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/219/1499.webp",
      sha256: "d60704cc974c35971fd0fca84c797bf5ac12eacef12b516b8f2abb708ca9beaf"
    },
    {
      id: "classic-display-1500",
      displayId: 1500,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1500.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/220/1500.webp",
      sha256: "ff37a08666c2207842890a8fcf2ce0d0838d82a8eafc766d14b991f143401f80"
    },
    {
      id: "classic-display-1501",
      displayId: 1501,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1501.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/221/1501.webp",
      sha256: "e2a8ac1ee5cc25b4972c8ef8ae60f4fa6f81663e8c803f8d8bd825bb6d2b5c66"
    },
    {
      id: "classic-display-1502",
      displayId: 1502,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1502.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/222/1502.webp",
      sha256: "7d7accb34e111a31887f83209796a2cf73f417cc45275bf8d7c284f8516df535"
    },
    {
      id: "classic-display-1503",
      displayId: 1503,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1503.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/223/1503.webp",
      sha256: "e976300641abdb980d15dd085f04f351451a1a90739b3e8ab4a2d32a3b6de17f"
    },
    {
      id: "classic-display-1504",
      displayId: 1504,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1504.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/224/1504.webp",
      sha256: "3be64d6b14be1ecb560434df7eb20dda710c0b81d71fb7fb4f4b0367eefdf919"
    },
    {
      id: "classic-display-1505",
      displayId: 1505,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1505.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/225/1505.webp",
      sha256: "42ff55b8c067aabe1ff3cd9392da3f9d548ff6016dcb003a968fade82fee6d18"
    },
    {
      id: "classic-display-1507",
      displayId: 1507,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1507.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/227/1507.webp",
      sha256: "521fbb87ca11dc3a654cb3af73fd9bf7ee8b9439e0e9a41c6be6a4fd7071ed6f"
    },
    {
      id: "classic-display-1508",
      displayId: 1508,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1508.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/228/1508.webp",
      sha256: "7c28a1389ea6b5712220391b4b66a46140776998ba8cecbd48170a4ff24d3403"
    },
    {
      id: "classic-display-1509",
      displayId: 1509,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1509.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/229/1509.webp",
      sha256: "5e68a7d630a585c55d412c67e16a0d62c7d8273b8a886e788133089d5fff95ba"
    },
    {
      id: "classic-display-1510",
      displayId: 1510,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1510.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/230/1510.webp",
      sha256: "c18b97b345a08ef26d85c82d536e1ab93188d2fca59aabe2cbca7412ec180499"
    },
    {
      id: "classic-display-1511",
      displayId: 1511,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1511.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/231/1511.webp",
      sha256: "cc4fcc7f358e76b158cb3c1b37c5f6014948d4a1fa295541ef10405a6ad5283b"
    },
    {
      id: "classic-display-1512",
      displayId: 1512,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1512.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/232/1512.webp",
      sha256: "01803302506075245904906ef131ed838489d54389546be1804a99934baa70dd"
    },
    {
      id: "classic-display-1513",
      displayId: 1513,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1513.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/233/1513.webp",
      sha256: "846945a1cb2ec81f0bd837d5f024dad6771b60374a0d46dcd2d12f65e754baed"
    },
    {
      id: "classic-display-1515",
      displayId: 1515,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1515.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/235/1515.webp",
      sha256: "802647125ca2812af476c5b362d17c3e3f895e8da2da5c4ef2195be5130d2fe7"
    },
    {
      id: "classic-display-1516",
      displayId: 1516,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1516.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/236/1516.webp",
      sha256: "effd68a482cab4b970d74e8e833dc9d1c56c780f65c86e5a3805c7db96a1cf07"
    },
    {
      id: "classic-display-1517",
      displayId: 1517,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1517.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/237/1517.webp",
      sha256: "0b37b18c5c21206e54f9b1e10916e66d3150cf13f4f0dd1261d175f0866c2191"
    },
    {
      id: "classic-display-1518",
      displayId: 1518,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1518.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/238/1518.webp",
      sha256: "cda3d3af03cdbc65bddf81c6e19068349f4db7aeeb3beba368004f4a3a28a62f"
    },
    {
      id: "classic-display-1519",
      displayId: 1519,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1519.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/239/1519.webp",
      sha256: "c12a78fee16a46880a656abefcb3dcb60a57c9f9f92e9ea572d1846321cb0651"
    },
    {
      id: "classic-display-1520",
      displayId: 1520,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1520.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/240/1520.webp",
      sha256: "e7620bc70644198747c41b18cb53f343223a3375d098197e0fbbba5865a1d003"
    },
    {
      id: "classic-display-1521",
      displayId: 1521,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1521.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/241/1521.webp",
      sha256: "bf0878c1bc345478c0f20c2053b9e0226cfacb46d8cebfeb7042000d986e2049"
    },
    {
      id: "classic-display-1522",
      displayId: 1522,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1522.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/242/1522.webp",
      sha256: "340ec5c85ad6be213634bfce8c7c7e90123f2e6543d569c97258da64d4c00183"
    },
    {
      id: "classic-display-1523",
      displayId: 1523,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1523.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/243/1523.webp",
      sha256: "2f1747afd21a9e7f8f2994d5a0fe6713cf81c844a5ad578fc2f7e335a458b3ad"
    },
    {
      id: "classic-display-1524",
      displayId: 1524,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1524.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/244/1524.webp",
      sha256: "cd04e0963d04289d7ca879a84d442881acf696c4f8ebac002efde8684b650f9f"
    },
    {
      id: "classic-display-1525",
      displayId: 1525,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1525.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/245/1525.webp",
      sha256: "1e7ab6a686a18b50ed2b0f25a7883549e223627642229d9c3d4f772bd193465f"
    },
    {
      id: "classic-display-1526",
      displayId: 1526,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1526.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/246/1526.webp",
      sha256: "e8f11740618f2eabe7b8d7c641acb832440a4309a14c2c68d9c9bb8e2a115bc5"
    },
    {
      id: "classic-display-1541",
      displayId: 1541,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1541.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/5/1541.webp",
      sha256: "bff923662e32cbec7ed39d89d2a4d6314618c10c3f8cdea125e216917f33a99a"
    },
    {
      id: "classic-display-1544",
      displayId: 1544,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1544.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/8/1544.webp",
      sha256: "3c6826a6d9233f2b9c184988c1e3d30abfe575911265e45ae2fb80ed2c977d33"
    },
    {
      id: "classic-display-1573",
      displayId: 1573,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1573.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/37/1573.webp",
      sha256: "0f9589d809a67ccd5013635cbee2ba3d0477c6e5f2f55569f05c59dafce9c079"
    },
    {
      id: "classic-display-1688",
      displayId: 1688,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1688.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/152/1688.webp",
      sha256: "9ee5a94aa3359d148ad807bfab7bb2d90fdde0e4d1399958298762636c218854"
    },
    {
      id: "classic-display-1689",
      displayId: 1689,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1689.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/153/1689.webp",
      sha256: "1f72b1fa3ddba2088c906740ac4355bc4892c7222bf19bbf036f7fd5bf3c8124"
    },
    {
      id: "classic-display-1690",
      displayId: 1690,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1690.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/154/1690.webp",
      sha256: "854ca272fe585a3c031471c51de52e981d0d1213f79fbf84ea978d4f5fb0c216"
    },
    {
      id: "classic-display-1691",
      displayId: 1691,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1691.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/155/1691.webp",
      sha256: "6081664f05062c3bc6a26aeac3ea868b710de2b4f7ae706cc78ccebf6e96be51"
    },
    {
      id: "classic-display-1692",
      displayId: 1692,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1692.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/156/1692.webp",
      sha256: "26faea24f751dfe8c8243dde07e1cbbbc322e65d9b16b2f16bb6bdc938369e1e"
    },
    {
      id: "classic-display-1694",
      displayId: 1694,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1694.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/158/1694.webp",
      sha256: "68e3499542f8b310ee6465e22d9bc69e47b1a211001e3660dd0ae85e6b168439"
    },
    {
      id: "classic-display-1695",
      displayId: 1695,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1695.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/159/1695.webp",
      sha256: "5e8e3eb1ed1cca93b89f9a83f2068564d142309120b72c9dca12c76865585c0d"
    },
    {
      id: "classic-display-1696",
      displayId: 1696,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1696.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/160/1696.webp",
      sha256: "0721cc6b56c13e4d72d760bcf642f655792ae591eb0e92d4d0a6df896daad4cb"
    },
    {
      id: "classic-display-1697",
      displayId: 1697,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1697.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/161/1697.webp",
      sha256: "3e4c02817898dff8493d92e601754e319b1db535cd26f2a0a0207750a54f6e48"
    },
    {
      id: "classic-display-1736",
      displayId: 1736,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1736.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/200/1736.webp",
      sha256: "7f6f5d4d36d213f07dace40ea551c48787d80fa809e3eaba69a3dce352c8ee8a"
    },
    {
      id: "classic-display-1741",
      displayId: 1741,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1741.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/205/1741.webp",
      sha256: "e99470cf0147eecbeaead4b305a58edf6e87bd8aab88f7e7c06fcf182e9c89e4"
    },
    {
      id: "classic-display-1742",
      displayId: 1742,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1742.webp",
      sha256: "66f030271d64ff531161355b88e5f5219e46d360d070c197201b8cabd5036ebc",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-1756",
      displayId: 1756,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1756.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/220/1756.webp",
      sha256: "21fd93729544f5d6176e3f85adc786887cc25bbbaaf7c66254b76609fd2caea3"
    },
    {
      id: "classic-display-1758",
      displayId: 1758,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1758.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/222/1758.webp",
      sha256: "b2b1722e4f3388a0e46469daff9ec5bec8c911be6148a654013317c94e277bb5"
    },
    {
      id: "classic-display-1765",
      displayId: 1765,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1765.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/229/1765.webp",
      sha256: "626557127433498ef048e786ea288658e84e94f092f765cb40fb7213d8b2ed7e"
    },
    {
      id: "classic-display-1815",
      displayId: 1815,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1815.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/23/1815.webp",
      sha256: "95ec30dce8852915ded4dafe90697d945112b9f9bdb79b29eed55a5cd2dbafd2"
    },
    {
      id: "classic-display-1859",
      displayId: 1859,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1859.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/67/1859.webp",
      sha256: "7a8b9acffa01a2b87438da44aa7c383575cc6b127194ba03e6d3d3b41b627441"
    },
    {
      id: "classic-display-1865",
      displayId: 1865,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1865.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/73/1865.webp",
      sha256: "6e7341acb41b2ac80a344fc8b4ed475a25fac4a798d0d7ad8b5c1c16c8373d8b"
    },
    {
      id: "classic-display-1894",
      displayId: 1894,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1894.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/102/1894.webp",
      sha256: "0ecd84bcd3fbd9fddc0bad915b4587791c28e6d5e5f03319b1afec9199f13f92"
    },
    {
      id: "classic-display-1912",
      displayId: 1912,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1912.webp",
      sha256: "9b87a2a88f66b46c3e6a245221993059aa1e3eb0a7e037c69c4cbffe0b889fcf",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-1943",
      displayId: 1943,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1943.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/151/1943.webp",
      sha256: "e1e111bd20d06727e836bf4f8801cbbfa820ce603d4769a3c26bab4bbfc2ef15"
    },
    {
      id: "classic-display-1944",
      displayId: 1944,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1944.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/152/1944.webp",
      sha256: "f014dd8174d124256d1b027c8c73a82d7f88d547bb5f9b07895d702ede6fe003"
    },
    {
      id: "classic-display-1984",
      displayId: 1984,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1984.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/192/1984.webp",
      sha256: "947280bfd1c894379f4defb04745eb297c8a136a4953a13e5d364cdb8050c55c"
    },
    {
      id: "classic-display-1985",
      displayId: 1985,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1985.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/193/1985.webp",
      sha256: "b595d96ac664de2d51dbfcd5316f02a278c5812affe5123e391ad9dcfa342835"
    },
    {
      id: "classic-display-1994",
      displayId: 1994,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1994.webp",
      sha256: "f3cb0758e90f05e713966b978479bf9122efea833250a8e93b3162764d9b0c57",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-1995",
      displayId: 1995,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-1995.webp",
      sha256: "c8ad439ee597903c4fa3c218dd4752f2c41d88c8337942992eda2d836ad4e08f",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-2026",
      displayId: 2026,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2026.webp",
      sha256: "09aa88d6bb9b0a85f8b685417b8d5b032554f3bba15a21e1546110172019c708",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-2029",
      displayId: 2029,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2029.webp",
      sha256: "4159d7e184ed5fb3ae11e1ff2bc97604453ec0682e32b22bf8d11d679dcab4f0",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-2038",
      displayId: 2038,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2038.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/246/2038.webp",
      sha256: "c344234ce54ee8498baec591fd230043205416888b980942ce95ee8ee6ffaaca"
    },
    {
      id: "classic-display-2051",
      displayId: 2051,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2051.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/3/2051.webp",
      sha256: "9dff2af7155d6a6bd4e8bc89dc40b7d1e55d8eb88881efdba1b20552f441641e"
    },
    {
      id: "classic-display-2072",
      displayId: 2072,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2072.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/24/2072.webp",
      sha256: "1e7446061c6019a4f7df38e4446f64e09e114b5927fc991d073ce215102cfddb"
    },
    {
      id: "classic-display-2073",
      displayId: 2073,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2073.webp",
      sha256: "97d4f13b98621c12a4c8e01a0109e7aa79e93724a465df0b05b78b0fb0902243",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-2074",
      displayId: 2074,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2074.webp",
      sha256: "8286cb41ed9b3bd49e60f73c580a9551917f1b6aa9fcaf2928992212c54c5376",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-2148",
      displayId: 2148,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2148.webp",
      sha256: "e3d833c1d5fbbaaf028419fc021f5de96f5125bd83a54e9dd8dfd916444852cd",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-2153",
      displayId: 2153,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2153.webp",
      sha256: "6e91c3ddc30e0d7fc64ea3d70c4b82e7f1313a103d5affff2eb094c6a473fe71",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-2181",
      displayId: 2181,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2181.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/133/2181.webp",
      sha256: "044f8fadea5409ce07c44aeaa332fb20147da33da938b4618d2f2d551be8a3f1"
    },
    {
      id: "classic-display-2299",
      displayId: 2299,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2299.webp",
      sha256: "a81c9953d2fb6072079bff8598d8052597e7e0b6e3d2513bd1bc232b53d65b72",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-2305",
      displayId: 2305,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2305.webp",
      sha256: "f631e928b059091e5619f223fe22e6bce88e0ae94026675a91e3e1211ec5cfc2",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-2311",
      displayId: 2311,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2311.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/7/2311.webp",
      sha256: "984b8a4857b360a82659b8245376a5e9c6341e4b66b32515343a828628f08350"
    },
    {
      id: "classic-display-2312",
      displayId: 2312,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2312.webp",
      sha256: "16f3bdaaa85a6522039f8a914e87df0a73ade251fd8b75b5a41b1e071fb8eab2",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-2314",
      displayId: 2314,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2314.webp",
      sha256: "6537fcbbd864190a37075d983e873c488bdff4ebed26de4911c81f6dddfd15e9",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-2316",
      displayId: 2316,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2316.webp",
      sha256: "1bc52049b8a78c2fa732c6c3354e9b9877be795b78ddc52bee940e26e0c6118c",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-2318",
      displayId: 2318,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2318.webp",
      sha256: "68a70cc9cb8a500e27dffb6852e01df7ae58afe2bb27c3fb0efb9b2665c28603",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-2321",
      displayId: 2321,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2321.webp",
      sha256: "e7f9832f2eb493bab07e081d4bffe261eae7d82bc874b38aec1eb2bb14c1cf89",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-2323",
      displayId: 2323,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2323.webp",
      sha256: "dd5b9b416caef59f9fb652691a20f57b7328f83206364456a17637de235d5932",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-2329",
      displayId: 2329,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2329.webp",
      sha256: "14228530adcbef8e284590f1b43b13224949ec47a5b3c66cb5a14a9d852a6ad6",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-2331",
      displayId: 2331,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2331.webp",
      sha256: "f141571e3f0cd60cc53f82f801f062f70ea4aa2279d984973c9eebea2219aa73",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-2333",
      displayId: 2333,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2333.webp",
      sha256: "5be183dbe25221498e6b56e31599f2c5b912c3683c5100284f7a84ae86452aed",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-2336",
      displayId: 2336,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2336.webp",
      sha256: "ebc023966a5cd236902d341e540c0c50ab3929909606dda4769a99264af9677d",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-2338",
      displayId: 2338,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2338.webp",
      sha256: "ebed491e5db9441ad1e41db86185578232a344fff7c9026d4146576df7f22166",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-2340",
      displayId: 2340,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2340.webp",
      sha256: "4f2b715ba3ee8d92b5e39618fb9170861ce0a66814a2b9b40dd26ca60b3a2c5e",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-2342",
      displayId: 2342,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2342.webp",
      sha256: "f69bdb5263c8da9859bea50eea1bd2e647908084673cfb5927fdcf629cf8beb2",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-2344",
      displayId: 2344,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2344.webp",
      sha256: "c5d2419121b7abc33d7b287fc4fafb22a9afef9181404ec05df5214ba0b565fd",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-2347",
      displayId: 2347,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2347.webp",
      sha256: "c3f6b66ee7e55a89572880229159699fea248f14e65d3c828cebd5fcee9e8e23",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-2349",
      displayId: 2349,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2349.webp",
      sha256: "3d79c002c01246ce320dfb824dbcb050362af0703e0ccbf99798938b473b9b23",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-2355",
      displayId: 2355,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2355.webp",
      sha256: "f1775c3864512207fae5445cd134ad4036a9773b7f6e8bb05c703bb88a551f4c",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-2357",
      displayId: 2357,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2357.webp",
      sha256: "499687db768c48e55ecbf3cfd21aface7cd49b559c628ad0e30f59bd9f8641a7",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-2359",
      displayId: 2359,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2359.webp",
      sha256: "9064eb9c94605a40801104afea8ad8f9da920050f277ab7ee640ed81b9fc45bb",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-2361",
      displayId: 2361,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2361.webp",
      sha256: "0c88aa581d9a2f011028925f1f26e6bcc5d1f67c4c13847acf34ff63686247dc",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-2363",
      displayId: 2363,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2363.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/59/2363.webp",
      sha256: "e16cb57ea9aab6233d44b2c13f04952bd418bfe399f102701ce6b4c5ed37a203"
    },
    {
      id: "classic-display-2364",
      displayId: 2364,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2364.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/60/2364.webp",
      sha256: "412ddc965d8b54fd25d9b5263325d1796bfc6e856c60da82530a8d0fbd72dc6f"
    },
    {
      id: "classic-display-2365",
      displayId: 2365,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2365.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/61/2365.webp",
      sha256: "066e92d66ebf1446b9e5427c8e23c2fc4b7fdb1ffd2dbce4a94fcee7727d459b"
    },
    {
      id: "classic-display-2366",
      displayId: 2366,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2366.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/62/2366.webp",
      sha256: "684fb65a853c5c3bb5fe2bad1564285e116e9e2c8a2a24da90dd496429260b84"
    },
    {
      id: "classic-display-2367",
      displayId: 2367,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2367.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/63/2367.webp",
      sha256: "4df385ebf0439b184a47c29704c08aca55076d8909b010af3738dff96fb99366"
    },
    {
      id: "classic-display-2368",
      displayId: 2368,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2368.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/64/2368.webp",
      sha256: "e0ac33c15bc07d219181dba4f9c63c842f1db9ab75c47eaacd161bae3794a6ef"
    },
    {
      id: "classic-display-2369",
      displayId: 2369,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2369.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/65/2369.webp",
      sha256: "f87a5026f1a8210be92aac7c296ba561829d3f2a731c504c8cb52b347141d804"
    },
    {
      id: "classic-display-2370",
      displayId: 2370,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2370.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/66/2370.webp",
      sha256: "38edc2666de6eef0fc1e9e207ea30ef029f6ff2a22a6b39cf6a8383269152d33"
    },
    {
      id: "classic-display-2371",
      displayId: 2371,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2371.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/67/2371.webp",
      sha256: "cffe28a59d98ce500a5c46c2b2263f657143c120b38f9c43ebedfe6b65f240c7"
    },
    {
      id: "classic-display-2372",
      displayId: 2372,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2372.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/68/2372.webp",
      sha256: "46c1f5827f1800da5a759dff271cf0d023e55d3d73592f7a5a63211144b0d66e"
    },
    {
      id: "classic-display-2373",
      displayId: 2373,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2373.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/69/2373.webp",
      sha256: "c7e898e7a1be9bd62828b21636e54fe496ded46db4fa7b3fa2952c3a88ed2cc8"
    },
    {
      id: "classic-display-2374",
      displayId: 2374,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2374.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/70/2374.webp",
      sha256: "5e0f5dfc5f98dc896e9e404e81cfa8786a91eb72baccaac8c9d3145901f773b5"
    },
    {
      id: "classic-display-2377",
      displayId: 2377,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2377.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/73/2377.webp",
      sha256: "a67fefa00cdfb75aadf500f6b0cb65476a1961f15f6ddad2192556129c3a8b27"
    },
    {
      id: "classic-display-2404",
      displayId: 2404,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2404.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/100/2404.webp",
      sha256: "485cfbb3c3549dfd2fa90632eabde736ec996fd248fd1cd1380c15feed750331"
    },
    {
      id: "classic-display-2405",
      displayId: 2405,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2405.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/101/2405.webp",
      sha256: "00c40745ac1e5e6749192ef00d24de046e6a6e2d5d541cabba58df2e7dae85e5"
    },
    {
      id: "classic-display-2408",
      displayId: 2408,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2408.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/104/2408.webp",
      sha256: "2231f8342365a705b5895efe339981911b85a0309083c2fef07b4a4db1fc06ce"
    },
    {
      id: "classic-display-2409",
      displayId: 2409,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2409.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/105/2409.webp",
      sha256: "eb3602df22572ed2570fa12c3453f8dac039062aa91d7aaa0205fd9bfd5aacd6"
    },
    {
      id: "classic-display-2410",
      displayId: 2410,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2410.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/106/2410.webp",
      sha256: "875519b85de6e08873ae8a1e3aa2a952723a18172689e73427e2ce7a3407eef1"
    },
    {
      id: "classic-display-2438",
      displayId: 2438,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2438.webp",
      sha256: "595d572a194a749e2134d717a2aecd2c6feda11ae9ef7013415bed135a7cc4a9",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-2440",
      displayId: 2440,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2440.webp",
      sha256: "920db348c57dfbd7a459e1323e30a0ba2fa0bfe2092e598e2b46db7e743656a4",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-2441",
      displayId: 2441,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2441.webp",
      sha256: "840b4fc2b957e5753e99a4029b8a00939e20b199a42c98abe095639c8b13b7b6",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-2447",
      displayId: 2447,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2447.webp",
      sha256: "b07922f98ba64158e28687639fc9406f4a2b10d34829646288797016fdd74f95",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-2485",
      displayId: 2485,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2485.webp",
      sha256: "2364c28bfc2920b921409421f9d00cb59914f5767e6eae66a14036e4cdb513b8",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-2541",
      displayId: 2541,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2541.webp",
      sha256: "29aafb25ad248a4bfa3f4e606b6fb46890da9d63203ba8ae276a28d46b5c2115",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-2710",
      displayId: 2710,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2710.webp",
      sha256: "8943c44809ed755003c6835ff44fa8b91fbc8bdec59683cf8af4c50be08ba0e2",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-2850",
      displayId: 2850,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2850.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/34/2850.webp",
      sha256: "e0fca20507ff048875fa89e142459c42d7c99f0d109612c7d498e340d02650ae"
    },
    {
      id: "classic-display-2959",
      displayId: 2959,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2959.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/143/2959.webp",
      sha256: "a134b78350038167e3b518c6174fdc89748ba37188dcf315f20c3f42aac0ae38"
    },
    {
      id: "classic-display-2961",
      displayId: 2961,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2961.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/145/2961.webp",
      sha256: "b2d652ac36408f33090ac5d898c1789eec73aa635833760106c1094adc2fbf45"
    },
    {
      id: "classic-display-2968",
      displayId: 2968,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2968.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/152/2968.webp",
      sha256: "b39a75d266132feed25a199e3771a631b5a96c4ed6ba519c82cef1fbbcf955b7"
    },
    {
      id: "classic-display-2974",
      displayId: 2974,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2974.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/158/2974.webp",
      sha256: "39b7a1147234ca1389f1120841960c9199a2d106e0e9585c222f2f7f898ed7d0"
    },
    {
      id: "classic-display-2985",
      displayId: 2985,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2985.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/169/2985.webp",
      sha256: "06dffe0f0ca0291310c5e00597072d2309a07e1097e6103537a7c95e672f3676"
    },
    {
      id: "classic-display-2989",
      displayId: 2989,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2989.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/173/2989.webp",
      sha256: "5f0ae8635dd2bc0800f2fc6156d76b569c65aa849964230d636147f35e8d9546"
    },
    {
      id: "classic-display-2993",
      displayId: 2993,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-2993.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/177/2993.webp",
      sha256: "183b04c6886bf137c9ee4716d9f76cbc9db78abe4dc7789980cc5bbb623844b8"
    },
    {
      id: "classic-display-3010",
      displayId: 3010,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3010.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/194/3010.webp",
      sha256: "f80ef2f6734659b4b0de8d2c84e4fa158e1e0a11690ccc435d654c404f7b8089"
    },
    {
      id: "classic-display-3027",
      displayId: 3027,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3027.webp",
      sha256: "ca05a68017dfbb9b1f201e4a02b127b6c25e8eda0c7cd7c42019cc57750b6708",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-3035",
      displayId: 3035,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3035.webp",
      sha256: "94dc35bc85431b76b253a918c32e0bd99833863d4836e9920b99c908c0f55211",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-3133",
      displayId: 3133,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3133.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/61/3133.webp",
      sha256: "805a4b3f4cfd8f9861663c8d7d7a71c38e19b649d5814eab972df68e1bb6703b"
    },
    {
      id: "classic-display-3167",
      displayId: 3167,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3167.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/95/3167.webp",
      sha256: "95f7275c7f3ba1ffa6622519288a6186579c60daadd9794d49e51b7c9bdae2c0"
    },
    {
      id: "classic-display-3234",
      displayId: 3234,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3234.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/162/3234.webp",
      sha256: "da4b99af941ae8e77c7b8ae164d80fcd26d1700f62a0d0e8774ba7d23d2e3ae2"
    },
    {
      id: "classic-display-3236",
      displayId: 3236,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3236.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/164/3236.webp",
      sha256: "de4d17e8c2e3296a7de32f19a15256439e752a0fe3fa7adc73ee601c0f93a351"
    },
    {
      id: "classic-display-3237",
      displayId: 3237,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3237.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/165/3237.webp",
      sha256: "107affb92c2632f083f2e15de19721faee2c12ca5215e3366d3b1f41c4cfecfc"
    },
    {
      id: "classic-display-3238",
      displayId: 3238,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3238.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/166/3238.webp",
      sha256: "2826614d20a1ef77d2e654d651cf3d78dac3ef8c23342c9fd560729f712d19c8"
    },
    {
      id: "classic-display-3246",
      displayId: 3246,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3246.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/174/3246.webp",
      sha256: "bae9a7128bb83d03740ef057ad0792a2823a62758c40261cd6e6c94eae4f6fe4"
    },
    {
      id: "classic-display-3251",
      displayId: 3251,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3251.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/179/3251.webp",
      sha256: "4cbc5f7219bc6990c5b67ef0b4b95058843727a0ce8292df5b9eaea2224a6892"
    },
    {
      id: "classic-display-3253",
      displayId: 3253,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3253.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/181/3253.webp",
      sha256: "3b1aca8260a6c0b570c82b01a45769f20690a3ed4c49fe38ddd36e0322900eea"
    },
    {
      id: "classic-display-3254",
      displayId: 3254,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3254.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/182/3254.webp",
      sha256: "ba202abe9965675ce7b7a9fe57638286a42d0fb151d2efb48c87e18a82264132"
    },
    {
      id: "classic-display-3258",
      displayId: 3258,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3258.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/186/3258.webp",
      sha256: "1ca19bca39c7aad0d8c9fd4c6d0454a12ba44fce02ee96419313bf84535d8d9c"
    },
    {
      id: "classic-display-3259",
      displayId: 3259,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3259.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/187/3259.webp",
      sha256: "e745854f923d1beb5fc9b80dd61dab8c0be0b4d223727e81272a0b9b8651327c"
    },
    {
      id: "classic-display-3260",
      displayId: 3260,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3260.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/188/3260.webp",
      sha256: "c14e112653e0cc72754e2238a1e9accf1f7d2a8b774e64deae5680910c374e5e"
    },
    {
      id: "classic-display-3262",
      displayId: 3262,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3262.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/190/3262.webp",
      sha256: "8d3bb57778162a2e6cd4fc111d65343ef5235676b230d1c29a5bfa3c56d26540"
    },
    {
      id: "classic-display-3263",
      displayId: 3263,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3263.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/191/3263.webp",
      sha256: "d28e50492b14553ae50e8f130bf9112abde838fd5ab254f00eb2c89f8b17f257"
    },
    {
      id: "classic-display-3264",
      displayId: 3264,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3264.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/192/3264.webp",
      sha256: "bb8ee112efada350ee766df4e12444e12b2e9b16e7db752a7ff988756f3ab0ae"
    },
    {
      id: "classic-display-3265",
      displayId: 3265,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3265.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/193/3265.webp",
      sha256: "e09edc3bcddf7e53cfbcdf9f5d32ba090f6004c6665111c6b6ace936fdb7073a"
    },
    {
      id: "classic-display-3266",
      displayId: 3266,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3266.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/194/3266.webp",
      sha256: "ef422df647eee894b1dd598e17f18a4ab795b5087a22b60eedfe221a06c06fe6"
    },
    {
      id: "classic-display-3267",
      displayId: 3267,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3267.webp",
      sha256: "9753c274d6f7d905386664c0e6e3f1ff7ff7ea3e7728942f24fb4bd352cdba84",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-3268",
      displayId: 3268,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3268.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/196/3268.webp",
      sha256: "c0751927f9d1794d5edea22fb3c6cbc55d64e021cb3914f449ec3d3077ae0787"
    },
    {
      id: "classic-display-3269",
      displayId: 3269,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3269.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/197/3269.webp",
      sha256: "b17471ed83f8f22c977f40b819e2f24e84003b5816693b80ede1f7a551c71b6f"
    },
    {
      id: "classic-display-3270",
      displayId: 3270,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3270.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/198/3270.webp",
      sha256: "82b8d62d29f202eed4c6a2dfa70db2e396045dd576424e8e42ebed44a440ae7c"
    },
    {
      id: "classic-display-3271",
      displayId: 3271,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3271.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/199/3271.webp",
      sha256: "c1fb0dfbcec62f43b33eed4e69e6f8fdbe3dcf0e93a2110735d123d5d3d34cce"
    },
    {
      id: "classic-display-3272",
      displayId: 3272,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3272.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/200/3272.webp",
      sha256: "081c902ac1d2b4ffe8eaa4aa3019546b0933c1de728db658c3147b59653fa17c"
    },
    {
      id: "classic-display-3273",
      displayId: 3273,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3273.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/201/3273.webp",
      sha256: "620bd57e2cc090626ca1b10bb7be93e97e870844264ccdc1979b9e82fd1f976e"
    },
    {
      id: "classic-display-3274",
      displayId: 3274,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3274.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/202/3274.webp",
      sha256: "174a7e9b92788d85bd21b1daa92ed26c5a98cf26358c6b75629d3258d5c17933"
    },
    {
      id: "classic-display-3275",
      displayId: 3275,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3275.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/203/3275.webp",
      sha256: "1f8cb79d860bfde2208ec34c1453c6faffb62d4cc373356713247ad7b060245f"
    },
    {
      id: "classic-display-3276",
      displayId: 3276,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3276.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/204/3276.webp",
      sha256: "4a5204ca3e3c94dab543dcba1026836e6637489da47d9e79f0a4c4d0e95e7bbc"
    },
    {
      id: "classic-display-3277",
      displayId: 3277,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3277.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/205/3277.webp",
      sha256: "928c789e945732fa5828804cf08ac0efc1fd8828e3b8b56ffd60d647902f6963"
    },
    {
      id: "classic-display-3278",
      displayId: 3278,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3278.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/206/3278.webp",
      sha256: "b7f9b0f1a24c03da4b765ef209f834dd5f709e515b5e7bc8b4c6c75574163beb"
    },
    {
      id: "classic-display-3279",
      displayId: 3279,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3279.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/207/3279.webp",
      sha256: "b8364476e6fdce65ab5c567f6db556c0778a7513dce15fe9962cbb1a1013b701"
    },
    {
      id: "classic-display-3280",
      displayId: 3280,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3280.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/208/3280.webp",
      sha256: "773b152cafd05aa32dc80ad99450e643995772337c20be5b1a346c19d40781b7"
    },
    {
      id: "classic-display-3281",
      displayId: 3281,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3281.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/209/3281.webp",
      sha256: "28d7b48f1e0833a2c6ce46d836e9665e1d0cab0c8d3737bad110297bf7b1df76"
    },
    {
      id: "classic-display-3282",
      displayId: 3282,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3282.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/210/3282.webp",
      sha256: "37b4b608bf3c2f6855be58316da61877a00f0628187091932928136e89bb380d"
    },
    {
      id: "classic-display-3283",
      displayId: 3283,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3283.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/211/3283.webp",
      sha256: "94862d71b9e681df8034e9682f780cb1b018efa6c05bece9638081dc8535cd67"
    },
    {
      id: "classic-display-3284",
      displayId: 3284,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3284.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/212/3284.webp",
      sha256: "7be50e824e22115642a6c286c00a2a201a5e37e25200471c873f64023ce25871"
    },
    {
      id: "classic-display-3285",
      displayId: 3285,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3285.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/213/3285.webp",
      sha256: "bc58815f9fb11aaac627f1473d54235bf22b8a7262b48ed3e1fcafb6a314bab0"
    },
    {
      id: "classic-display-3286",
      displayId: 3286,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3286.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/214/3286.webp",
      sha256: "1a6bd05907db55d35e261cdcf09aa7f0797f63631422ce05408b33e9b91187b1"
    },
    {
      id: "classic-display-3287",
      displayId: 3287,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3287.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/215/3287.webp",
      sha256: "4ecf310e2fc0bd0e0c1905397a31d1b5f235cf1c3d54004c60fb424dec6b621a"
    },
    {
      id: "classic-display-3288",
      displayId: 3288,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3288.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/216/3288.webp",
      sha256: "5ed412d7990d54fed7c2dbc5e21dc70aa154e06ab77f92bc1b1b5064a3699dbf"
    },
    {
      id: "classic-display-3289",
      displayId: 3289,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3289.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/217/3289.webp",
      sha256: "bfdb29cf6a2e4b65d6a710cc0fd36593a2d95babff40cc7afa39cd590d2f411a"
    },
    {
      id: "classic-display-3290",
      displayId: 3290,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3290.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/218/3290.webp",
      sha256: "b536c066ba0e06dc4aea6b45e333a02b0e67687cc62050c684508126410306ce"
    },
    {
      id: "classic-display-3291",
      displayId: 3291,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3291.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/219/3291.webp",
      sha256: "348ebb3833e4e547b6c225091143375a144c7ed731f99a7afea8b8c630a3b4a5"
    },
    {
      id: "classic-display-3292",
      displayId: 3292,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3292.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/220/3292.webp",
      sha256: "b610052401d9b488c72f7dfd43c17cb38b563e20a3af19e898848ca27a82dab8"
    },
    {
      id: "classic-display-3293",
      displayId: 3293,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3293.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/221/3293.webp",
      sha256: "e6e6821a7127d5ecf0916c38b2f86c2ecb4edeb8f71b6ed47c70d4d6e1597200"
    },
    {
      id: "classic-display-3295",
      displayId: 3295,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3295.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/223/3295.webp",
      sha256: "2153a3b4fc01f866f4c69e14da66ffa81d34e7617347015434b0bf98a1a3c790"
    },
    {
      id: "classic-display-3296",
      displayId: 3296,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3296.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/224/3296.webp",
      sha256: "e6f66ffe7289b7706fb4c5ffc73b09633c7c4217c22cd420ffb3c68f7b21a0dc"
    },
    {
      id: "classic-display-3297",
      displayId: 3297,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3297.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/225/3297.webp",
      sha256: "334abacd95dfd359d8963525d5ae07ff566ec17a3fd1e800ad9851e2a4a56a93"
    },
    {
      id: "classic-display-3298",
      displayId: 3298,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3298.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/226/3298.webp",
      sha256: "0619a80d00d11069374dd11601d40542ccd3ffeef8bc30371a9cd076da050e92"
    },
    {
      id: "classic-display-3300",
      displayId: 3300,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3300.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/228/3300.webp",
      sha256: "02501b537cbfd4aa10457335135d5bc14f328794a740115bdf80bceb9d4428ea"
    },
    {
      id: "classic-display-3301",
      displayId: 3301,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3301.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/229/3301.webp",
      sha256: "07fbca1ba465858c91e56baac3cef43e4063263e7cafc297e52b1e1917074f3b"
    },
    {
      id: "classic-display-3302",
      displayId: 3302,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3302.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/230/3302.webp",
      sha256: "1ee7512440b580a2bdefa3bfe391f86a7b0985404df7e6a9164d53d534dacc4c"
    },
    {
      id: "classic-display-3305",
      displayId: 3305,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3305.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/233/3305.webp",
      sha256: "159c89c8693589f3a236b06c4f6d7986fc61b23ac5b0fef83f460c1b5e9b11f5"
    },
    {
      id: "classic-display-3306",
      displayId: 3306,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3306.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/234/3306.webp",
      sha256: "5800ae11287cc363963b4d58150c79fe5b93537a00ec4aec11c23a09c604d5da"
    },
    {
      id: "classic-display-3307",
      displayId: 3307,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3307.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/235/3307.webp",
      sha256: "567d055cc273429b813ec102c8b0160b5d9bd80567531e13c8992abadd0f65e7"
    },
    {
      id: "classic-display-3308",
      displayId: 3308,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3308.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/236/3308.webp",
      sha256: "22f54dfe60d3f486c5e8ccd00e0f8da1c00d098dbb18429a539a59cbcbc712b8"
    },
    {
      id: "classic-display-3309",
      displayId: 3309,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3309.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/237/3309.webp",
      sha256: "424fad0d683016e04d034d3ff3426190bb0bf30cf0402bed805188baad8fff14"
    },
    {
      id: "classic-display-3310",
      displayId: 3310,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3310.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/238/3310.webp",
      sha256: "e36e26cdcf9803bcdeb5a9f4b48b1d4eaf6c3c16e16bc28192572e5bd1e6b8a7"
    },
    {
      id: "classic-display-3311",
      displayId: 3311,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3311.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/239/3311.webp",
      sha256: "1ba06d406d95b7f605cb416c3325f33870732a9820075424391b41d4c6e562a7"
    },
    {
      id: "classic-display-3312",
      displayId: 3312,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3312.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/240/3312.webp",
      sha256: "98346ddafc9b4e4f69912f0c65e1f3542f514fdc0502fa1a35ae1ff028bd118e"
    },
    {
      id: "classic-display-3313",
      displayId: 3313,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3313.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/241/3313.webp",
      sha256: "6697d64c7671e87e36803306d13ce64c8ca64b8e5bdfd4c920377588be8086b3"
    },
    {
      id: "classic-display-3314",
      displayId: 3314,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3314.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/242/3314.webp",
      sha256: "dec9b4b3de1a9ef51f34f3f637844dc1c029311838d68f097cd96ab1bee2f3ed"
    },
    {
      id: "classic-display-3315",
      displayId: 3315,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3315.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/243/3315.webp",
      sha256: "7c7538d80ea3911c4e0a199301b2b62ca306944f00cd05168ba34abd11d0471a"
    },
    {
      id: "classic-display-3316",
      displayId: 3316,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3316.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/244/3316.webp",
      sha256: "bfdd58622fd0aacd5e4f7c12444ee9867ecccc7746c75394261df55271f4d410"
    },
    {
      id: "classic-display-3317",
      displayId: 3317,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3317.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/245/3317.webp",
      sha256: "0675b716239d3eaee169d1e3d3214233c633ef694d18afaee15f947011b334d3"
    },
    {
      id: "classic-display-3320",
      displayId: 3320,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3320.webp",
      sha256: "e0c4106a835e9a1e87524cb83d7f1d653399884acc40d0b6dca124d58666790a",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-3321",
      displayId: 3321,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3321.webp",
      sha256: "1f7ea2c690e30199a74ec021ea5933f82fec2f9c721b8e41d8b0c5a2fb9bc1ad",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-3322",
      displayId: 3322,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3322.webp",
      sha256: "038ab0eb7880d5c206c6728c8d84abce59e664a82c657d1cbfce0dd5694adb89",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-3323",
      displayId: 3323,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3323.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/251/3323.webp",
      sha256: "7dc043b345c40760564450a37798be28d922b2a3297d0b7b2ebcf3ea10ba0f18"
    },
    {
      id: "classic-display-3324",
      displayId: 3324,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3324.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/252/3324.webp",
      sha256: "40cafca2cbe3e116c7cff18eb3586b404dde1c698caa4d3e6831c2342f9ea124"
    },
    {
      id: "classic-display-3326",
      displayId: 3326,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3326.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/254/3326.webp",
      sha256: "eec9aadb13266385fd4ba7d14d53511ab276e642c55af97989460e64dbf50bb4"
    },
    {
      id: "classic-display-3327",
      displayId: 3327,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3327.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/255/3327.webp",
      sha256: "5357435b27cdfd6aa1a4757fecf85b13bc50e6a85be71845e9cbd3befd7b1bfb"
    },
    {
      id: "classic-display-3328",
      displayId: 3328,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3328.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/0/3328.webp",
      sha256: "cc46758999d58a92a59873d312b74997fc55babb67e44d009382e567d130c123"
    },
    {
      id: "classic-display-3329",
      displayId: 3329,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3329.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/1/3329.webp",
      sha256: "0d26bc81f9dcc53c3581aa7df9932a073258124c256e0d679a7f31ea7b239c78"
    },
    {
      id: "classic-display-3330",
      displayId: 3330,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3330.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/2/3330.webp",
      sha256: "4655b3591023e5b24c549c266c4f9b59e6a8ba045f3a588905c671d1e4e74420"
    },
    {
      id: "classic-display-3331",
      displayId: 3331,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3331.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/3/3331.webp",
      sha256: "a43f14b0bd3ac22a25ca51b3b8d85ed6ccc076b29cebe8f469c5891740c5ee06"
    },
    {
      id: "classic-display-3332",
      displayId: 3332,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3332.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/4/3332.webp",
      sha256: "ade489d5bac4eac36382dd29569334747e6d1b0a0587fcb950c4ec98b834c304"
    },
    {
      id: "classic-display-3335",
      displayId: 3335,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3335.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/7/3335.webp",
      sha256: "91c3f70d06ad0d804d13516bcc8510a7c04fca03a596459e754dbc45e6a3eb6e"
    },
    {
      id: "classic-display-3336",
      displayId: 3336,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3336.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/8/3336.webp",
      sha256: "7e9468a4a3de2dfdbdecc0cb087c661cfa0be954fd24a70ec3ae61df9c4cdc7b"
    },
    {
      id: "classic-display-3337",
      displayId: 3337,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3337.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/9/3337.webp",
      sha256: "988de1e811e22df579bfd76d8da12e07fc0ecf60b79fc0a0883d01333baae664"
    },
    {
      id: "classic-display-3338",
      displayId: 3338,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3338.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/10/3338.webp",
      sha256: "00beb93d3b38545d8337ddaa46ebbd032a8b5d29fb405d9e24896903374280fb"
    },
    {
      id: "classic-display-3339",
      displayId: 3339,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3339.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/11/3339.webp",
      sha256: "1d5f552d1e95a906c72c8aa8be82c2cabf922ad3f84af2c9d8de51b6d6ab7ed8"
    },
    {
      id: "classic-display-3340",
      displayId: 3340,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3340.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/12/3340.webp",
      sha256: "8b537eaff6da5ae00a6ff046a961d3201d47ae2f705abfcff1b4715515d1c51b"
    },
    {
      id: "classic-display-3341",
      displayId: 3341,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3341.webp",
      sha256: "05ba3a004d9216847cbd3aebda914718e0e99694744bcce31d312ceba7aed793",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-3342",
      displayId: 3342,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3342.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/14/3342.webp",
      sha256: "f2bcb6a2f871ade4ee1eab150d66e5ddfd255366b372e8249f4a599221e17afc"
    },
    {
      id: "classic-display-3343",
      displayId: 3343,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3343.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/15/3343.webp",
      sha256: "c984d0bb0166f5531640c221026e34bfa956fa6a98b9e43aa49714c33786d55f"
    },
    {
      id: "classic-display-3344",
      displayId: 3344,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3344.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/16/3344.webp",
      sha256: "f6374047527278e6949c9eef5b90ad84974a48b382ff7e51fb8b11681b350a86"
    },
    {
      id: "classic-display-3345",
      displayId: 3345,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3345.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/17/3345.webp",
      sha256: "df8a5b6cc1987c624b33993c7c0b6a48ae15b8c2d8899d50bef1cd8550c0098f"
    },
    {
      id: "classic-display-3346",
      displayId: 3346,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3346.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/18/3346.webp",
      sha256: "d0b84bbd671117ab9f4aee76764d8e268969ab90683b900b0fcfee604fdb7e13"
    },
    {
      id: "classic-display-3347",
      displayId: 3347,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3347.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/19/3347.webp",
      sha256: "2aa1af9e0689ae81b7e0ec0fbb18be3447a57f89bf0d6b4f3a8d11c2ddab649e"
    },
    {
      id: "classic-display-3348",
      displayId: 3348,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3348.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/20/3348.webp",
      sha256: "5dced2c3c01eaac8279361876c28daa9f5547d4b4173143cb4bc44e02a349334"
    },
    {
      id: "classic-display-3351",
      displayId: 3351,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3351.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/23/3351.webp",
      sha256: "f7e349b521e5ab9db4b3e698f1e860b951cdc386e7ac428543f00e0041c61093"
    },
    {
      id: "classic-display-3354",
      displayId: 3354,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3354.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/26/3354.webp",
      sha256: "df8ca2252cec35ff0aaa6a684d42bbcb22d0abb5720bbea04e89e7dc87a38cb9"
    },
    {
      id: "classic-display-3444",
      displayId: 3444,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3444.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/116/3444.webp",
      sha256: "11b66ccb3bb1dc3b918289a11802b298deb9e9de21a52590a7f13f20f072fef2"
    },
    {
      id: "classic-display-3445",
      displayId: 3445,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3445.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/117/3445.webp",
      sha256: "9197c8cf51cdd7e5b1c4bb9e32fa328855931b1ca34c1b88bf082097443e437f"
    },
    {
      id: "classic-display-3448",
      displayId: 3448,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3448.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/120/3448.webp",
      sha256: "82b48ce0c5400a5df30d1420759ed4eeb40dfb069fbeadeaf8f95c620ca58316"
    },
    {
      id: "classic-display-3449",
      displayId: 3449,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-3449.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/121/3449.webp",
      sha256: "78a78dfe288a1c7a038b2708d9f0f53cbccc8bf1d40546090b8853730e91698a"
    },
    {
      id: "classic-display-4162",
      displayId: 4162,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-4162.webp",
      sha256: "c227001f0b2aa3e34fbcbb6b6bacb3064ac33398fa00ed1cfe8cd8c7ebac569c",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-4272",
      displayId: 4272,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-4272.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/176/4272.webp",
      sha256: "b4fc4d14105b2b985c91dc91608d8afd490ba43aca4e64217008725df9b2c746"
    },
    {
      id: "classic-display-4275",
      displayId: 4275,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-4275.webp",
      sha256: "b742129a44717645bf06444c6d958b563da05665d19eaf828bbe6436090a1bbf",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-4276",
      displayId: 4276,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-4276.webp",
      sha256: "5e51517a91894bed2fe5a045bc4c191896c0be16992a7375c8be4a14a0e5c138",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-4279",
      displayId: 4279,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-4279.webp",
      sha256: "60ed72cbc3d4af3736a025a1c13a2bfdf118946e924a1416b63257e06c81c17e",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-4281",
      displayId: 4281,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-4281.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/185/4281.webp",
      sha256: "54ad5d186ab78d93352c0cc8a92bb3caaa2a0488214e90a0dbbd4bbdcb749046"
    },
    {
      id: "classic-display-4325",
      displayId: 4325,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-4325.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/229/4325.webp",
      sha256: "559ee535f6a11cc5f7a1365b28bb9f7e8cd044fda802e17055f049561cd1a570"
    },
    {
      id: "classic-display-4327",
      displayId: 4327,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-4327.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/231/4327.webp",
      sha256: "f61fa4b33eca62ca97eaa7d9058fdbd38e633b1104c5d123d732c1f7c2b46292"
    },
    {
      id: "classic-display-4328",
      displayId: 4328,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-4328.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/232/4328.webp",
      sha256: "602daab9d268e08c6699ab90d2b17bab51b8a63a73bb74705307337f39415e04"
    },
    {
      id: "classic-display-4329",
      displayId: 4329,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-4329.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/233/4329.webp",
      sha256: "25681a3086bad44b762020b5feffbec3a362c7cb45fc8a909dd22d078e5a7a13"
    },
    {
      id: "classic-display-4416",
      displayId: 4416,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-4416.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/64/4416.webp",
      sha256: "2ebac1c421244c081c4caa5605eb8683a0a1ba325585fc8049a6dcceeb750ad0"
    },
    {
      id: "classic-display-4418",
      displayId: 4418,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-4418.webp",
      sha256: "2da73b6579803175d8ea32225580e790b6874b0f47adf0094be245b038a3e350",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-4420",
      displayId: 4420,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-4420.webp",
      sha256: "52775b1a19a2bbc328c653cf7a6168050895345027808798bcbd109690dd5c83",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-4422",
      displayId: 4422,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-4422.webp",
      sha256: "3426a628abb768a7a181d69dd9c0f11df42e748ccd44326565bcbbfddb1f4ea3",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-4423",
      displayId: 4423,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-4423.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/71/4423.webp",
      sha256: "efb41ea27c2e7bc3f92ba6c58ec49aea74af93e1beb072bc03d315d7162ceb33"
    },
    {
      id: "classic-display-4449",
      displayId: 4449,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-4449.webp",
      sha256: "cd19c95f34a31a5f31733d312dd69c4875d45fd4903acf1633d139f0e6b60e3d",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-4469",
      displayId: 4469,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-4469.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/117/4469.webp",
      sha256: "6913616e8fc03545f06b663963028ac3c6b3f2fc7d5001d72051d51355fe092f"
    },
    {
      id: "classic-display-4558",
      displayId: 4558,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-4558.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/206/4558.webp",
      sha256: "3fecb6f95626be79d838cbb77bb0e06c2d9c7ebc191ff49d26f573c1980f37b1"
    },
    {
      id: "classic-display-4731",
      displayId: 4731,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-4731.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/123/4731.webp",
      sha256: "dcbf1b8234320a54b1aba8babb3ce48d01db486330ca289dbfc7d627d90b576f"
    },
    {
      id: "classic-display-4732",
      displayId: 4732,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-4732.webp",
      sha256: "1df5ae28b398a4e5bea36754daea34a20151b39d24734abba107b2d242229968",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-4866",
      displayId: 4866,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-4866.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/2/4866.webp",
      sha256: "1fa2c56dba632fe2b9c22e13fe1efd16f6ebcd1b8f28abc7ce7a683f32ea0dfc"
    },
    {
      id: "classic-display-4867",
      displayId: 4867,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-4867.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/3/4867.webp",
      sha256: "f171722d4b213faff7eec50d3c5fc0d9c3715601f8111e100649dbd1b921b8fc"
    },
    {
      id: "classic-display-4885",
      displayId: 4885,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-4885.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/21/4885.webp",
      sha256: "eed8ccfee7c80c0049218ee3aba2f8184901919b88fb3dd1f8c55969f7376d29"
    },
    {
      id: "classic-display-4886",
      displayId: 4886,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-4886.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/22/4886.webp",
      sha256: "d8aab582c78615942830417fc661ef4db1550448edc0c6617815031246a343a4"
    },
    {
      id: "classic-display-4887",
      displayId: 4887,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-4887.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/23/4887.webp",
      sha256: "60fc6c597579823e1c6d1ecd0000a43eac22e71ed190b42bd4f580ec88a9d6e1"
    },
    {
      id: "classic-display-4888",
      displayId: 4888,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-4888.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/24/4888.webp",
      sha256: "216b42588d15861c663f7270b866ce38d59669a09502a45971676e796c0c2729"
    },
    {
      id: "classic-display-4947",
      displayId: 4947,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-4947.webp",
      sha256: "b035650cbb5aa99509345c6c1c562eb0235e3981e2c418c6d717560fbed596d3",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-4951",
      displayId: 4951,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-4951.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/87/4951.webp",
      sha256: "c76facd23d6826fee766ab26946c1a7f1e67d5199fe26f267144dd9ead7bf36c"
    },
    {
      id: "classic-display-4959",
      displayId: 4959,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-4959.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/95/4959.webp",
      sha256: "c8be1bdb47ff6761d7155a53d7d945c9dfe098de7869cc221866dbdcd19380ca"
    },
    {
      id: "classic-display-4996",
      displayId: 4996,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-4996.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/132/4996.webp",
      sha256: "b331c3c38318c30de8d3d8e7e759902378235ce0154d7a3eb939c3d66ec8c629"
    },
    {
      id: "classic-display-4997",
      displayId: 4997,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-4997.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/133/4997.webp",
      sha256: "5e7448fc9bace3470eb72f915e0ebcf9d40b6eea5449c8a93416023e7e288afc"
    },
    {
      id: "classic-display-4998",
      displayId: 4998,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-4998.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/134/4998.webp",
      sha256: "7688af70286141afcbb24743d30df45124bc4f372b0057ecfa75c39c45b273f0"
    },
    {
      id: "classic-display-5000",
      displayId: 5e3,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5000.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/136/5000.webp",
      sha256: "a932886056424e4d933b312946986aa85155bea3cf531221273518ccec27d8ab"
    },
    {
      id: "classic-display-5001",
      displayId: 5001,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5001.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/137/5001.webp",
      sha256: "6b1aaa59a81f938d0693879d9faaae183915133e61d42f70ac94ee62215ca40a"
    },
    {
      id: "classic-display-5012",
      displayId: 5012,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5012.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/148/5012.webp",
      sha256: "53f458811072c807e22b618362e0c1cd30a933e81543e9869c88ca6a04d97081"
    },
    {
      id: "classic-display-5014",
      displayId: 5014,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5014.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/150/5014.webp",
      sha256: "919c0f792707d9ead94ae0aba574c9bcd20c1f001904eb922f2f78491e1c2d45"
    },
    {
      id: "classic-display-5015",
      displayId: 5015,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5015.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/151/5015.webp",
      sha256: "624bebb8873253605f69c731d52d0dc16a0ea8c537719eb61f4d124bc5f828d3"
    },
    {
      id: "classic-display-5032",
      displayId: 5032,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5032.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/168/5032.webp",
      sha256: "d32b90773a3cc6623bfd8f0a747dadd6f0af319d3adf853c06f4d73aefd41131"
    },
    {
      id: "classic-display-5034",
      displayId: 5034,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5034.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/170/5034.webp",
      sha256: "6737cdcdf5bbf7fdf1642f8659100bd9577e890da0393eaee7db41b06bb74049"
    },
    {
      id: "classic-display-5035",
      displayId: 5035,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5035.webp",
      sha256: "1561de34458fd0712f1852f5d549bf86ed3638c81d44c3617c5ae52676a60edb",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-5038",
      displayId: 5038,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5038.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/174/5038.webp",
      sha256: "e630933916858f145c8cbe9de683157584998b8fb6f56074398664563600ccac"
    },
    {
      id: "classic-display-5043",
      displayId: 5043,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5043.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/179/5043.webp",
      sha256: "99819148125ea366827a84b56a3b178cedb275adb4bb66fec1601b329bce3b6b"
    },
    {
      id: "classic-display-5072",
      displayId: 5072,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5072.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/208/5072.webp",
      sha256: "aea7960463220f8b24e66b07b4b319fcc1976ee95ef5c7f219e144a70bd25c2c"
    },
    {
      id: "classic-display-5073",
      displayId: 5073,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5073.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/209/5073.webp",
      sha256: "1c3c70487e372a88200310e9aa763a93ecfa3a0af2c61208d08a8a166db75dd5"
    },
    {
      id: "classic-display-5074",
      displayId: 5074,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5074.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/210/5074.webp",
      sha256: "9b6d821be5d339919fe3a953340f82723563b8fd60a7db946bf98df6b76c34a3"
    },
    {
      id: "classic-display-5075",
      displayId: 5075,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5075.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/211/5075.webp",
      sha256: "de44eb75ce40108f206c6928fbaf8083eea993c01d9afd96279baeca9c945ac4"
    },
    {
      id: "classic-display-5076",
      displayId: 5076,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5076.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/212/5076.webp",
      sha256: "8f23adfbe2b630bf5d226291ef811712c21d5dec5af96ebc26bb574ad1ab3d74"
    },
    {
      id: "classic-display-5077",
      displayId: 5077,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5077.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/213/5077.webp",
      sha256: "0585f1e5689d813469dc9e90c87355606cf5b9e80549c5aee53462b4aa8129c8"
    },
    {
      id: "classic-display-5078",
      displayId: 5078,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5078.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/214/5078.webp",
      sha256: "5d5b0f57d5a2fd705aee20ae92e5ffd21bf73c5d216ec2a7710a0ebb2ebde6e3"
    },
    {
      id: "classic-display-5079",
      displayId: 5079,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5079.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/215/5079.webp",
      sha256: "6fb031d0196ced2ce71396bb0ed285fac0656bdb0be608dc60a8af13db916c26"
    },
    {
      id: "classic-display-5080",
      displayId: 5080,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5080.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/216/5080.webp",
      sha256: "3010895dbd7a727dbfdfe8f2319c44c056a371443ebaea9fc0e0ba02fceb8172"
    },
    {
      id: "classic-display-5081",
      displayId: 5081,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5081.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/217/5081.webp",
      sha256: "f961cc3e8cb8d53e78cf5aabfc3ad0f3c7de0b0384404f26d11337c59695c091"
    },
    {
      id: "classic-display-5082",
      displayId: 5082,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5082.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/218/5082.webp",
      sha256: "1f1c764caf3c928041ed584b6fd2f32a30703fdbbe60b350269b9d2e9d430993"
    },
    {
      id: "classic-display-5086",
      displayId: 5086,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5086.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/222/5086.webp",
      sha256: "4edf5fa3edd3c652593985e591d7883c0e838adde3f123a0c386a511b7259f12"
    },
    {
      id: "classic-display-5087",
      displayId: 5087,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5087.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/223/5087.webp",
      sha256: "4de7f9ada2c4a5e5886bbc0b17a51c2878d21ce6e9096ae9dc1ae94d12d75f58"
    },
    {
      id: "classic-display-5092",
      displayId: 5092,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5092.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/228/5092.webp",
      sha256: "4048319297dfc3f2646361ed8d8347a4a143b01f10588bf61a9a6719631dd7ab"
    },
    {
      id: "classic-display-5128",
      displayId: 5128,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5128.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/8/5128.webp",
      sha256: "74185f142cc302449a7387f769c81677d5c90c1189ab92e70b8ec694b76d64b5"
    },
    {
      id: "classic-display-5229",
      displayId: 5229,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5229.webp",
      sha256: "9bc211be3a51615fe3fe35435b1bfb8e50821e52c55c71535b3f3a7fcd7f2fbb",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-5233",
      displayId: 5233,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5233.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/113/5233.webp",
      sha256: "823c4776119cdd99cea6ae2b44a6ba4fc7b72d24fd187c6733b6883d9b15845a"
    },
    {
      id: "classic-display-5243",
      displayId: 5243,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5243.webp",
      sha256: "8e3723248392fe3781c9017301339b3388e1585db4de99892c37a9ce12ec95bb",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-5327",
      displayId: 5327,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5327.webp",
      sha256: "2405c2f0f55a6a86e661832a7d3b12f507241d461e6eb913149cc86e3570da17",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-5365",
      displayId: 5365,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5365.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/245/5365.webp",
      sha256: "34b093c94c50497cac7ccf613ff7956e8ef8aea0d13a4b1f3b64d902990b1176"
    },
    {
      id: "classic-display-5377",
      displayId: 5377,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5377.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/1/5377.webp",
      sha256: "69c28f4883b47f6206bb4aaf394a1ef5a42ecb2d3a7396f1996cb3ccf6c62158"
    },
    {
      id: "classic-display-5378",
      displayId: 5378,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5378.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/2/5378.webp",
      sha256: "2fc330c2c74c5b20cad25aa8154f6dc1a480380b3df5d0a85f87d089d93dee15"
    },
    {
      id: "classic-display-5444",
      displayId: 5444,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5444.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/68/5444.webp",
      sha256: "7aafb936621703be362d536745147ebff2614ed5db031885a31b565d591a6b56"
    },
    {
      id: "classic-display-5446",
      displayId: 5446,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5446.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/70/5446.webp",
      sha256: "fc4bfa9696b5a64c7b6809ad651ce668615263713950de1c41e3a49cc5958e0c"
    },
    {
      id: "classic-display-5526",
      displayId: 5526,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5526.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/150/5526.webp",
      sha256: "5b089690e6a7766c20d384e2dcb8000f6dec1f7a521902277290df32e57648a1"
    },
    {
      id: "classic-display-5527",
      displayId: 5527,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5527.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/151/5527.webp",
      sha256: "37a09407e79b6ea1320f2d55a47b8d45831d3766ba03952fbb6d368a0d982389"
    },
    {
      id: "classic-display-5545",
      displayId: 5545,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5545.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/169/5545.webp",
      sha256: "dfd4033db3fd26d4b1886827f0edea7714ca60979d73e145954842f4e68b9cac"
    },
    {
      id: "classic-display-5546",
      displayId: 5546,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5546.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/170/5546.webp",
      sha256: "75cea5d807e297c59fc22890ddfc51246364c33b9374d0c65e4ca04d1a5dd8d2"
    },
    {
      id: "classic-display-5547",
      displayId: 5547,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5547.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/171/5547.webp",
      sha256: "875b7785e66d710588af940ee3757cfb80c3e86125bbaf35c0976662bdd1852c"
    },
    {
      id: "classic-display-5548",
      displayId: 5548,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5548.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/172/5548.webp",
      sha256: "b456e6ac80ea18ada2b65075b6d11d1df90bb05b40499dde7665103720a828f6"
    },
    {
      id: "classic-display-5549",
      displayId: 5549,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5549.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/173/5549.webp",
      sha256: "4aaaeff08daf3a35bc1d586eb832e919dce73f536a52aa82915ca8415c8a3d7b"
    },
    {
      id: "classic-display-5551",
      displayId: 5551,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5551.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/175/5551.webp",
      sha256: "5be8ef2ba6456d501710882b12ca9ef64631855d257b9fd52357d0ab7575408b"
    },
    {
      id: "classic-display-5552",
      displayId: 5552,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5552.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/176/5552.webp",
      sha256: "26de609dee3cfaea9252e32252978f14c43c8c4f7dd3630b890181ca7031f735"
    },
    {
      id: "classic-display-5553",
      displayId: 5553,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5553.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/177/5553.webp",
      sha256: "040a5010acd3ebfe5e9131122773ba3c84c6fbbcb804a5b86196acb39ed3797b"
    },
    {
      id: "classic-display-5554",
      displayId: 5554,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5554.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/178/5554.webp",
      sha256: "e863574ae33990bea75e384e092f7914dfe7b7cc89926588c7d09d51ef9789be"
    },
    {
      id: "classic-display-5555",
      displayId: 5555,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5555.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/179/5555.webp",
      sha256: "397b85e2fb456673bf0280b54c5c5bd93050f2776d5f4df07b5b6e035f8b67ac"
    },
    {
      id: "classic-display-5556",
      displayId: 5556,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5556.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/180/5556.webp",
      sha256: "3a85471e8d46baa3a7a066f08319d045e1398fa7115d7b17d7ea363666974095"
    },
    {
      id: "classic-display-5565",
      displayId: 5565,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5565.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/189/5565.webp",
      sha256: "efef05bc74b74b59c019d190a2317af7eca271a0d576bb6477ee2db3c77fdae3"
    },
    {
      id: "classic-display-5566",
      displayId: 5566,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5566.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/190/5566.webp",
      sha256: "3bec9492151337e769a5aa4cea87647c49d6be6f15030d44b7efae39601c683d"
    },
    {
      id: "classic-display-5567",
      displayId: 5567,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5567.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/191/5567.webp",
      sha256: "194ea54c5d9c6ba98e2d33a9008358557313843065e96fd84a41365e29ee93c0"
    },
    {
      id: "classic-display-5570",
      displayId: 5570,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5570.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/194/5570.webp",
      sha256: "e3a05d3682c20a125455e69cbadddbf67a25c281d46a4ca6c5b6e8b730be5e26"
    },
    {
      id: "classic-display-5585",
      displayId: 5585,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5585.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/209/5585.webp",
      sha256: "c215ef973158a1637a76463a5f6f038f368126b058f37856ffdcdb744ce81c45"
    },
    {
      id: "classic-display-5586",
      displayId: 5586,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5586.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/210/5586.webp",
      sha256: "ca8d6273d50cbc94afc7a69ffc66e91849116f1d811753136092ec8928d1a3e2"
    },
    {
      id: "classic-display-5728",
      displayId: 5728,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5728.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/96/5728.webp",
      sha256: "feb3840214c8fc8baaeb06968cd9a8fac208af0860f791a262a4bef624bd5b23"
    },
    {
      id: "classic-display-5783",
      displayId: 5783,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5783.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/151/5783.webp",
      sha256: "7cc08706ca6fba589f15a582e29d6de9f7f4cff3fdab03f4c80ec46ff5ba49cc"
    },
    {
      id: "classic-display-5805",
      displayId: 5805,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5805.webp",
      sha256: "fb28788ce146bb40344c05553e93c3d754e415ab2963e8f888cf56c2d873f2d8",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-5806",
      displayId: 5806,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5806.webp",
      sha256: "366c4bd7d7872a41a1251666132d581ccf14c3ebe99da1b2dab1a54997bfca6d",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-5811",
      displayId: 5811,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5811.webp",
      sha256: "08354c4e5bc092507c315096574f7a41e231f6a975e4c22b3b4f630adc214ab2",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-5812",
      displayId: 5812,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5812.webp",
      sha256: "be2bbaec341483a06d52eef5890fadf331a50ec991f6a20668870fd200e27e5a",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-5813",
      displayId: 5813,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5813.webp",
      sha256: "8f48d545e195d53d9b010e1c19cd26b46a7fb98eba012c77cce5c901ed7ea4a0",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-5832",
      displayId: 5832,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-5832.webp",
      sha256: "07ff8cda5e939daa6d4109884b04fb7af9b54b6380a41e19965fa7e70ece36e1",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-6007",
      displayId: 6007,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-6007.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/119/6007.webp",
      sha256: "1ba06d406d95b7f605cb416c3325f33870732a9820075424391b41d4c6e562a7"
    },
    {
      id: "classic-display-6061",
      displayId: 6061,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-6061.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/173/6061.webp",
      sha256: "790ca02aaf516a7e46996c596df333976c3b301454509e62c73a689b1516c51e"
    },
    {
      id: "classic-display-6072",
      displayId: 6072,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-6072.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/184/6072.webp",
      sha256: "844e26639a5db8dfd39527ffc3cff8f8bc2b253a3495ff7cfb2d250f900aa194"
    },
    {
      id: "classic-display-6198",
      displayId: 6198,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-6198.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/54/6198.webp",
      sha256: "9aa160af3bcd9f7edb1be9952675e4412b19d791c00f852b392d0b1f4dbd921c"
    },
    {
      id: "classic-display-6368",
      displayId: 6368,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-6368.webp",
      sha256: "794c2320ff32519b23ef052d46fb176bb192058f95df6d2ce35302eb553ac5db",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-6446",
      displayId: 6446,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-6446.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/46/6446.webp",
      sha256: "00e144676fdf63371ee4bb6be638714f1bf2074e190bece5ca17b737878c5a27"
    },
    {
      id: "classic-display-6632",
      displayId: 6632,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-6632.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/232/6632.webp",
      sha256: "7015592aa2757b4d3dba65c31f5aaf5e1527c378da69caf3e3b0c116659abc8d"
    },
    {
      id: "classic-display-6844",
      displayId: 6844,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-6844.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/188/6844.webp",
      sha256: "3019df0e3bae740e7c17946cae06f8b7288a43b238103d58921a98d21bdd391a"
    },
    {
      id: "classic-display-7008",
      displayId: 7008,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-7008.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/96/7008.webp",
      sha256: "dbb2054d85e614f1e1f291ef46ecd8711ad549082bf9c347e10bf142893fa120"
    },
    {
      id: "classic-display-7109",
      displayId: 7109,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-7109.webp",
      sha256: "49168e45ccfbe9baecc643bbabcda0c5d0baee2e36a85e18721a4aa2dffac48f",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-7110",
      displayId: 7110,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-7110.webp",
      sha256: "ed1b4ec0e2d34a763012c3b23b35cc7fb2804b6513fb15cf8776e04e523d0259",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-7111",
      displayId: 7111,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-7111.webp",
      sha256: "f098cf53694fbfd11dd4605dcea1edef98ff69979c15dbd24b668dd04ddb177c",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-7112",
      displayId: 7112,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-7112.webp",
      sha256: "cbfc357715259e44fe59c529d7fa0b5af0d3bef56ae758cfcacbaaf824223b52",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-7113",
      displayId: 7113,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-7113.webp",
      sha256: "59aff9693b52112692cc20aa0081f4b5e3e228031d0a0f222b4a12476794e158",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-7124",
      displayId: 7124,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-7124.webp",
      sha256: "ebb8287b5aa88b0b031bc1740a53807681025567848b7716cc0e6e47116c99c3",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-7125",
      displayId: 7125,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-7125.webp",
      sha256: "585168be097643ce76bb713fa329d8e313690062b8272ebe8bae1e6cdc14accf",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-7130",
      displayId: 7130,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-7130.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/218/7130.webp",
      sha256: "eeeae11db3fc8ff7d132a0982d5d4eafe856758dbca6f1c1ac3bbe9325fea7d5"
    },
    {
      id: "classic-display-7131",
      displayId: 7131,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-7131.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/219/7131.webp",
      sha256: "eb67b110baf0d4af70ecfeee8177e28c08805640b8aee477b0239d0ef5ba76fd"
    },
    {
      id: "classic-display-7308",
      displayId: 7308,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-7308.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/140/7308.webp",
      sha256: "fe9e7c475eb38c8177d23598e28b0944d9e9ef98b4d70547b38cd71b4788d4af"
    },
    {
      id: "classic-display-7550",
      displayId: 7550,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-7550.webp",
      sha256: "803fe717fa35b844b9c6a33ac1077b116433e2dea84c16067e8d459f8d734667",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-7555",
      displayId: 7555,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-7555.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/131/7555.webp",
      sha256: "5cf46ccd461862e4cf9fafb2bea6cfe9d1df2b0e486c08eb19dd9d59abf5e947"
    },
    {
      id: "classic-display-7613",
      displayId: 7613,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-7613.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/189/7613.webp",
      sha256: "0abbd5489f85210bf86f5fa073b0441d61939763ad1582db72cefc78220be6db"
    },
    {
      id: "classic-display-7673",
      displayId: 7673,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-7673.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/249/7673.webp",
      sha256: "816577720fb4a5814def5b084870c44eac7240524e4990ef90ca2d469f9f04a1"
    },
    {
      id: "classic-display-7848",
      displayId: 7848,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-7848.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/168/7848.webp",
      sha256: "ffd0d8c750715314c622e2f8a6e1110e3163540d5b6283b9c75a70b70c040d2a"
    },
    {
      id: "classic-display-7849",
      displayId: 7849,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-7849.webp",
      sha256: "ddf1923fe9e5aa247c556304378efaf930dfa4bc5463e955ccf8a18a6a5d41e6",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-7935",
      displayId: 7935,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-7935.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/255/7935.webp",
      sha256: "eca5debd26c0f07de3edc5dfa57d4129320ea4c7d6f0b832d14a7b369961999b"
    },
    {
      id: "classic-display-7991",
      displayId: 7991,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-7991.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/55/7991.webp",
      sha256: "8df2bd6e470a3b8278c56a8384231f20f6ba35f3635c925b6db2d19c209d282d"
    },
    {
      id: "classic-display-7992",
      displayId: 7992,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-7992.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/56/7992.webp",
      sha256: "64f9ad9dc2df8f2991f04ee404d174db2c2c3adfa3b612aefe47985d557d3d8b"
    },
    {
      id: "classic-display-8185",
      displayId: 8185,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-8185.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/249/8185.webp",
      sha256: "d589cec55231ba1de7ba1019ed157d086de6fcd89fef85e1d02c589e5e995207"
    },
    {
      id: "classic-display-8186",
      displayId: 8186,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-8186.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/250/8186.webp",
      sha256: "acabcb93533fc09536524cd10f3ea34cf7ff14a0449fd31f1b17537a9c0bd0ba"
    },
    {
      id: "classic-display-8489",
      displayId: 8489,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-8489.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/41/8489.webp",
      sha256: "60e1134dd88e58d629415cb423cee2e25c67aa34d4f4a7279b8cb0789b02b647"
    },
    {
      id: "classic-display-8632",
      displayId: 8632,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-8632.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/184/8632.webp",
      sha256: "470fdec8443d6bdf8e1aec2b96359bc5d1b4b3da1f2d072466e4fd12b4c2f2f6"
    },
    {
      id: "classic-display-8769",
      displayId: 8769,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-8769.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/65/8769.webp",
      sha256: "a8effa3bc39120ef4b6eb8e631c4ec305f136f3a3f2edecdb72616f2d836b73d"
    },
    {
      id: "classic-display-8809",
      displayId: 8809,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-8809.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/105/8809.webp",
      sha256: "a87044e53d3ffec64b479ed2c7d39721e641418fefa1dc4e9bbad65973e6f9be"
    },
    {
      id: "classic-display-8871",
      displayId: 8871,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-8871.webp",
      sha256: "1cc888a0b6817674be91ca593bb77a673f766d51c322e755a89942870ee53694",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-9249",
      displayId: 9249,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-9249.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/33/9249.webp",
      sha256: "4c515fbe4af00debe7f512a77ac4cc3f7b3b083f9ecd94d9551eba240c5dff1e"
    },
    {
      id: "classic-display-9257",
      displayId: 9257,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-9257.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/41/9257.webp",
      sha256: "a16397f30214899537ee9e49b6b610a3648b50bcfd2bce23433fb4169715b1b6"
    },
    {
      id: "classic-display-9265",
      displayId: 9265,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-9265.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/49/9265.webp",
      sha256: "27e391e819e7de963d5e82b736939db8dad0fe28fefd656ed1a42900611962e6"
    },
    {
      id: "classic-display-9570",
      displayId: 9570,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-9570.webp",
      sha256: "09d7af90b4f7593eb9538a0aa55fbf179c2a667d530b6b48a3fb6dd376bef179",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-9786",
      displayId: 9786,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-9786.webp",
      sha256: "a66a986b39026406c34c11a148c8784d527e8706f6bcdad412bcb149babc20c0",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-9810",
      displayId: 9810,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-9810.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/82/9810.webp",
      sha256: "c56ece104c3dc81f53e612c0ecfda09f899c31ba2f7ee47d0df566fd8b934a92"
    },
    {
      id: "classic-display-9989",
      displayId: 9989,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-9989.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/5/9989.webp",
      sha256: "c1721017531bdf7678f0adb150f0b6a5fbcdaf921671f896ba2a102fa44a0869"
    },
    {
      id: "classic-display-10131",
      displayId: 10131,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-10131.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/147/10131.webp",
      sha256: "43c9ff5f77e5a56d38f03f849ec5224a1959e95655ef1872ca03f977a552889f"
    },
    {
      id: "classic-display-10215",
      displayId: 10215,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-10215.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/231/10215.webp",
      sha256: "9fd2aa3c6976e8f1d6be2e7e1857b179dfc3cffb34985f0150dc9bdc2e988530"
    },
    {
      id: "classic-display-10477",
      displayId: 10477,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-10477.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/237/10477.webp",
      sha256: "02370753076bfc06d736e8463d25560567696caddf378d9f0af393543a792b6c"
    },
    {
      id: "classic-display-10569",
      displayId: 10569,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-10569.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/73/10569.webp",
      sha256: "d5ef27fa0ffc450a7eb99ef9487d3c88444ffee2b96fb4cc71b850724ae63a72"
    },
    {
      id: "classic-display-10591",
      displayId: 10591,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-10591.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/95/10591.webp",
      sha256: "9bfaf634e220f46521e1cd9910bb1860a2c5a4daa77bcf98720a9edd7ccb7c9a"
    },
    {
      id: "classic-display-10610",
      displayId: 10610,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-10610.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/114/10610.webp",
      sha256: "e309f05f6ab7a51d1893b904e98eaf7eca57c91a4e9a01e3cba0ab19ab6b7815"
    },
    {
      id: "classic-display-10625",
      displayId: 10625,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-10625.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/129/10625.webp",
      sha256: "db70da5a916d7abd8d5fd0f2aa40bf611a22f587b3fd7e92f3edc05ad681c8b0"
    },
    {
      id: "classic-display-10626",
      displayId: 10626,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-10626.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/130/10626.webp",
      sha256: "aae30456fec433f8672335dfcf7bc08f4eb79f41d2598f41c326c38740d3f5e1"
    },
    {
      id: "classic-display-10628",
      displayId: 10628,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-10628.webp",
      sha256: "73b0961b90a45a6f73b7b29407868641bc1f4be52f9f6e0ada8bd524449221b7",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-10630",
      displayId: 10630,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-10630.webp",
      sha256: "bb3731d2f1a2c9ee273e2ccfdde9f7741d9027035c1e283c99f940fbeb37ef37",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-10790",
      displayId: 10790,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-10790.webp",
      sha256: "cdadfac54009adc34a379e26641bb00620ef1105097b9640711f9098f0211496",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-10791",
      displayId: 10791,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-10791.webp",
      sha256: "cc0b8af28bd88167d6398523c167726b345cf3769d06eb591373830a73861e1d",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-10832",
      displayId: 10832,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-10832.webp",
      sha256: "29ecc0f83bacd116d6c9afb46a16499df46df5224434c99152a0a3d5a3816368",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-10912",
      displayId: 10912,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-10912.webp",
      sha256: "b985d2608608041fa8f5474e8724058b350bd80ec2390ad18c090dac6709e1d0",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-10913",
      displayId: 10913,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-10913.webp",
      sha256: "1cae222c318df6f4e405be38e010039a68b313bcef71a202c69aa7d8d1f9278e",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-10995",
      displayId: 10995,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-10995.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/243/10995.webp",
      sha256: "45baff3584d22318159954dee361460799b36afec7a8b73a4643d78d0b738c6d"
    },
    {
      id: "classic-display-11044",
      displayId: 11044,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-11044.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/36/11044.webp",
      sha256: "8a3dffcf3c7cd286b156e83ab267a443d6de5e4954135b547fb3036cde3535b7"
    },
    {
      id: "classic-display-11354",
      displayId: 11354,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-11354.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/90/11354.webp",
      sha256: "99d5ebe5a1b12787f8bd8dff091d00219745f3de9b91397e44bf957ad8a33353"
    },
    {
      id: "classic-display-11402",
      displayId: 11402,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-11402.webp",
      sha256: "766f378d50bec941bd5b0ea3e4a75f420fc03d55673f3efc8b135a05ccc1f418",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-11412",
      displayId: 11412,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-11412.webp",
      sha256: "9fee287a2bd3bb59ff95890ad7dd164ed8f4b892f3c2e53396b35a7dd55e9630",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-11415",
      displayId: 11415,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-11415.webp",
      sha256: "3a13d2a77376d5928fcdc7b49941766af17258a32a402d71bbc52495a4df5740",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-11655",
      displayId: 11655,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-11655.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/135/11655.webp",
      sha256: "348778e4641fe287b85079637da035086449f018848bfab45fa216f2d8ad8653"
    },
    {
      id: "classic-display-11686",
      displayId: 11686,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-11686.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/166/11686.webp",
      sha256: "1ba06d406d95b7f605cb416c3325f33870732a9820075424391b41d4c6e562a7"
    },
    {
      id: "classic-display-11804",
      displayId: 11804,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-11804.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/28/11804.webp",
      sha256: "5c93f175880ad7edf486c746834f034572181d0297b233eaffd2fbf200b4bcda"
    },
    {
      id: "classic-display-11898",
      displayId: 11898,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-11898.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/122/11898.webp",
      sha256: "a7d4f8134f8e4e66e767a5ff84ea82ea7dccccf021706ade8561e79835d1d90a"
    },
    {
      id: "classic-display-11929",
      displayId: 11929,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-11929.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/153/11929.webp",
      sha256: "840ac6be208a9177ad03f84fa3fbe19c2965ebbfdcd0be459a64d4d5221684eb"
    },
    {
      id: "classic-display-11930",
      displayId: 11930,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-11930.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/154/11930.webp",
      sha256: "e784ebf8ecb5991bb480c9d52e53e2402c2184eba04ce36aaf2ec2eda7744588"
    },
    {
      id: "classic-display-12074",
      displayId: 12074,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-12074.webp",
      sha256: "cc0ecdd5f3bf7dcc641eb8d29a55d6244ec435a06273cd2134fe0bc230307c6c",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-12193",
      displayId: 12193,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-12193.webp",
      sha256: "3475b8d49be49f1c7ab70b95ea5386486639a1ed14e748cb16bb8169c7c4b986",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-12344",
      displayId: 12344,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-12344.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/56/12344.webp",
      sha256: "77baf68058e875cc93c98927bb0592f777ceddda4aa82b6e099da0d1875f23fb"
    },
    {
      id: "classic-display-12923",
      displayId: 12923,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-12923.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/123/12923.webp",
      sha256: "bfbe8de993798992f1812d184fb6c8a46fb8e13a39c4f430d69bd9d5910d5bab"
    },
    {
      id: "classic-display-13049",
      displayId: 13049,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-13049.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/249/13049.webp",
      sha256: "54b76982d74a6e91159572ca3bbef96d15dbe52ea7c6cd4557f8c7e86e975c02"
    },
    {
      id: "classic-display-13069",
      displayId: 13069,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-13069.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/13/13069.webp",
      sha256: "1ba06d406d95b7f605cb416c3325f33870732a9820075424391b41d4c6e562a7"
    },
    {
      id: "classic-display-13091",
      displayId: 13091,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-13091.webp",
      sha256: "b6e9d47b25107eb3de8272a27326aef57355e025e26ae361cac5e34f2b95d0ba",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-13171",
      displayId: 13171,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-13171.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/115/13171.webp",
      sha256: "c6fbc9186b1bbb54d98984b369a9d3da5eafe0a87e48da5c550b7e8e9c5f1e65"
    },
    {
      id: "classic-display-13349",
      displayId: 13349,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-13349.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/37/13349.webp",
      sha256: "98d07a15786b8a9ff79b5eee917c192bbb9e110293948ab5c8ae493cffc3ae65"
    },
    {
      id: "classic-display-13355",
      displayId: 13355,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-13355.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/43/13355.webp",
      sha256: "9b2a532c9ceef7cf5fe85376e8cce4cc33bfae2450ad1560504592026df33929"
    },
    {
      id: "classic-display-13356",
      displayId: 13356,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-13356.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/44/13356.webp",
      sha256: "d38fea395895aaf029957726a1f1df0d7e566f524f02bed049a9c02189b54b1d"
    },
    {
      id: "classic-display-14273",
      displayId: 14273,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-14273.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/193/14273.webp",
      sha256: "12b14075aa2c33ca64b9b9a170a8a669dfd9a5ce34aba9f6a866241f58a035c9"
    },
    {
      id: "classic-display-14338",
      displayId: 14338,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-14338.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/2/14338.webp",
      sha256: "9eea3bdd18d69fb1c8252c47a2bad3ffaa3ae91bda42938fd346870e7fdb5d56"
    },
    {
      id: "classic-display-14403",
      displayId: 14403,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-14403.webp",
      sha256: "84754feee648cc5eeea8b1a598918e5188069353fae36ad7ee64e8ab7f5914db",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-14431",
      displayId: 14431,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-14431.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/95/14431.webp",
      sha256: "90b860b2de5aa84c9ce7d5bc974c6ff595dedb5975eb43054f4551edd3999e25"
    },
    {
      id: "classic-display-14472",
      displayId: 14472,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-14472.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/136/14472.webp",
      sha256: "a0a66098f2e7196cfd388cc51561537e3531059e170b4f917a124b5a95b4f81d"
    },
    {
      id: "classic-display-14492",
      displayId: 14492,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-14492.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/156/14492.webp",
      sha256: "2088351adb60f73488cbf633b06d7af10a3cb6802fc154cb66a086a7a8ed88b4"
    },
    {
      id: "classic-display-14493",
      displayId: 14493,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-14493.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/157/14493.webp",
      sha256: "4e6c4f3e8ae29db8967b4e2a045f8984d2bd47035c7324117b36e5c3229639a3"
    },
    {
      id: "classic-display-14500",
      displayId: 14500,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-14500.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/164/14500.webp",
      sha256: "5f235d7ef9e7693fadadf2b9e20947a2e264db05493758c09279c9aeed76672c"
    },
    {
      id: "classic-display-14529",
      displayId: 14529,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-14529.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/193/14529.webp",
      sha256: "4af890991ea827cbb16c45cf7c836df3523867f4eedfcebfd3bbb0d27d77621d"
    },
    {
      id: "classic-display-14582",
      displayId: 14582,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-14582.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/246/14582.webp",
      sha256: "7bc993f94a8829b352db5ecb0a37c88e80a8ec743ca6e9283a781c19903d0cef"
    },
    {
      id: "classic-display-14583",
      displayId: 14583,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-14583.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/247/14583.webp",
      sha256: "ac32e16b2b4049beb95f71f06bda7f7dfded8e79dab796b1cba0faa549ff9267"
    },
    {
      id: "classic-display-14589",
      displayId: 14589,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-14589.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/253/14589.webp",
      sha256: "070cb3ccaa15bae69bd99492a552f846649534b32981f27b73834b89777569d3"
    },
    {
      id: "classic-display-14733",
      displayId: 14733,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-14733.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/141/14733.webp",
      sha256: "8b0e20f2eda6af877e5d2860aa4638102ee44f8367ba4904cd17f5ff86479e11"
    },
    {
      id: "classic-display-14753",
      displayId: 14753,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-14753.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/161/14753.webp",
      sha256: "3af3dae2f5a5b9d0ee9534be22d1bbcaba82c88a4ef58fda65c9a542d94e5353"
    },
    {
      id: "classic-display-14854",
      displayId: 14854,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-14854.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/6/14854.webp",
      sha256: "6b3daace3ec8ac2c55f7d1530b6a12e223577ebb4ef23eb610459f30537a1fa7"
    },
    {
      id: "classic-display-14855",
      displayId: 14855,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-14855.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/7/14855.webp",
      sha256: "422176de21e11605813b52efb5abcfd66d8dbb19a90391e1ce90bf536ac041ef"
    },
    {
      id: "classic-display-14856",
      displayId: 14856,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-14856.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/8/14856.webp",
      sha256: "5ac589957101f2cdd9a49b8d1888e01dee5e5ac7913c65c4f278511fe2472e3a"
    },
    {
      id: "classic-display-14875",
      displayId: 14875,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-14875.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/27/14875.webp",
      sha256: "321f50e003bfded4b970755c2a4b4869338e6d7e6f38e2ff66bed7b2cdca35d4"
    },
    {
      id: "classic-display-14876",
      displayId: 14876,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-14876.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/28/14876.webp",
      sha256: "904c677ca6e675480cd3cbb90cfe055f8fcdf2b0414cded61bf5469577ea82af"
    },
    {
      id: "classic-display-14877",
      displayId: 14877,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-14877.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/29/14877.webp",
      sha256: "a230595db2e6eb0dd72cfa358e0244ffe74144339811bc79650d8889f6ca78e5"
    },
    {
      id: "classic-display-14880",
      displayId: 14880,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-14880.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/32/14880.webp",
      sha256: "7ad21574a55e7185e90337841c8e163d1a5129e653c2d6d703aaca582c8efde2"
    },
    {
      id: "classic-display-14881",
      displayId: 14881,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-14881.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/33/14881.webp",
      sha256: "38199cfd610ff3454ddd0f6ba64811153cb5f7da200f34d5190b2d7fc6bb6734"
    },
    {
      id: "classic-display-14882",
      displayId: 14882,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-14882.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/34/14882.webp",
      sha256: "2433b2a1d1ce633bf0d5eda4ba6066efa021116483b6515f31a99e954660613a"
    },
    {
      id: "classic-display-14883",
      displayId: 14883,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-14883.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/35/14883.webp",
      sha256: "79c63af5ae08356c7a7b6e5706e2db64932c104f70f3595b7abfd67fe804f27b"
    },
    {
      id: "classic-display-14890",
      displayId: 14890,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-14890.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/42/14890.webp",
      sha256: "33ed110fd27311804543172486ccd587e52457c570e212670545241405323c06"
    },
    {
      id: "classic-display-14935",
      displayId: 14935,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-14935.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/87/14935.webp",
      sha256: "ffd60d6b4b0b917e80d18e9f4492b8b3fae7542b38a186e9998abc080aa7e863"
    },
    {
      id: "classic-display-14936",
      displayId: 14936,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-14936.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/88/14936.webp",
      sha256: "0b3b0e4b125a172e09dada9b4f4ec4ba0dda90ed6a6c0ee0ee730d9004e858ce"
    },
    {
      id: "classic-display-14937",
      displayId: 14937,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-14937.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/89/14937.webp",
      sha256: "2fa8c9cbea86c3788e1066a5aba761c803e87b78e865ea4b35340f81de78fefd"
    },
    {
      id: "classic-display-14939",
      displayId: 14939,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-14939.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/91/14939.webp",
      sha256: "7651ec47ad3b1d83c307aa371ee582aa020e0e0d2f147626d7dbfe6c2e1fe49c"
    },
    {
      id: "classic-display-14940",
      displayId: 14940,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-14940.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/92/14940.webp",
      sha256: "6d6b956bf3b49d906ee4b5eb779dfe439b25cf7326010deaf37c828a4a62b6a6"
    },
    {
      id: "classic-display-14943",
      displayId: 14943,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-14943.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/95/14943.webp",
      sha256: "2a74c5a9646c14e3ff4bd3ab6003e37f8278e46fe40e5a838e6339c0b62cc865"
    },
    {
      id: "classic-display-15098",
      displayId: 15098,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-15098.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/250/15098.webp",
      sha256: "fc296f3a76080b532b6088caca1a1332f7ea9bae743e5bddf15d4ead322aecac"
    },
    {
      id: "classic-display-15116",
      displayId: 15116,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-15116.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/12/15116.webp",
      sha256: "b56b2ee1ed0073ce6e267fc4423da6d7076b643a25cfeff504f0c02db3d2fe19"
    },
    {
      id: "classic-display-15251",
      displayId: 15251,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-15251.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/147/15251.webp",
      sha256: "c3567ef3ec6abc84c29d22db14fe920e17a8705d2482765f4193b52de673dfa0"
    },
    {
      id: "classic-display-15255",
      displayId: 15255,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-15255.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/151/15255.webp",
      sha256: "f205e04b20a4be4413358d6fcd936eb0404d1f6094647c49e51169279a0e45c0"
    },
    {
      id: "classic-display-15259",
      displayId: 15259,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-15259.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/155/15259.webp",
      sha256: "1af0a2909c6bcbd007920e7667dfd33f3cfab48118081cbddd3b157dd4a22bcb"
    },
    {
      id: "classic-display-15294",
      displayId: 15294,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-15294.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/190/15294.webp",
      sha256: "1ba06d406d95b7f605cb416c3325f33870732a9820075424391b41d4c6e562a7"
    },
    {
      id: "classic-display-15368",
      displayId: 15368,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-15368.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/8/15368.webp",
      sha256: "64db7b6c8d5acc8ff4b7ec7193658934f9af9e19ac9e835efb4ee24684592d1e"
    },
    {
      id: "classic-display-15389",
      displayId: 15389,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-15389.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/29/15389.webp",
      sha256: "869fd947cab15e310453ed4fce4f6b47988b2d82655cd5ed517a6b155b80dc11"
    },
    {
      id: "classic-display-15594",
      displayId: 15594,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-15594.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/234/15594.webp",
      sha256: "e6377aed979dc7e2338e78095b361b4abf2f1840012015068491c869caa0b57b"
    },
    {
      id: "classic-display-15614",
      displayId: 15614,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-15614.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/254/15614.webp",
      sha256: "e6aff90c72a6e6810484218ecde9011d309d0c76bc2f3e515924bd6f7ca84acd"
    },
    {
      id: "classic-display-15633",
      displayId: 15633,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-15633.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/17/15633.webp",
      sha256: "bbeeaf2febf369405b4114930cd0468ab0a62e6d975c82526201cf92c19f3bbe"
    },
    {
      id: "classic-display-15643",
      displayId: 15643,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-15643.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/27/15643.webp",
      sha256: "a7ebc2cfd3639f25ed7d7894ffb868baac3d85e673df5c9a46e425d2d5d8f0d1"
    },
    {
      id: "classic-display-15669",
      displayId: 15669,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-15669.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/53/15669.webp",
      sha256: "9470f8701d235cdfa21b46004c5a2c3d1f65cd726bb6e4bd7c1506b284f35693"
    },
    {
      id: "classic-display-15713",
      displayId: 15713,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-15713.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/97/15713.webp",
      sha256: "823ae75f1142352ab5a6029be8f1c1fada630088e97595fd0bcdf527a5f2e221"
    },
    {
      id: "classic-display-15728",
      displayId: 15728,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-15728.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/112/15728.webp",
      sha256: "7a2ea3a9a915212577fc309522adb976a88d5734a333cabab339686737a875ad"
    },
    {
      id: "classic-display-15864",
      displayId: 15864,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-15864.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/248/15864.webp",
      sha256: "5e78391e242f52642daa3c144dbc9411cbc89ec3d652941f6f904c91d50a7f1c"
    },
    {
      id: "classic-display-15865",
      displayId: 15865,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-15865.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/249/15865.webp",
      sha256: "19b5f9d74827e0f36e0bfc471e43427e66c3df5edc2d57c1ee66b4924dbec1dd"
    },
    {
      id: "classic-display-15869",
      displayId: 15869,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-15869.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/253/15869.webp",
      sha256: "04be46c36cd5f4cd60a769d8f0d18aba76faba7bbd61236421bab9d90e747eab"
    },
    {
      id: "classic-display-15950",
      displayId: 15950,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-15950.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/78/15950.webp",
      sha256: "2421afd01b553e99bde82aa4cebc3030f1d6f3875b240a847719921a75dc1758"
    },
    {
      id: "classic-display-15953",
      displayId: 15953,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-15953.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/81/15953.webp",
      sha256: "abc3dff68617f17081a1d351370afe761b6633a5f7a5c38cf8ebe249f2cf8b09"
    },
    {
      id: "classic-display-15990",
      displayId: 15990,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-15990.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/118/15990.webp",
      sha256: "988d48d746ffb7d45109d25115195b934a07afd4c28177e20fc873a1d20a7f88"
    },
    {
      id: "classic-display-16005",
      displayId: 16005,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-16005.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/133/16005.webp",
      sha256: "0dc8e54426bba51c5f5a40f9acb8a91677baad9581500fb73337621095f82d70"
    },
    {
      id: "classic-display-16006",
      displayId: 16006,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-16006.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/134/16006.webp",
      sha256: "99d7ba6e61c60048ea62035e623c2c8d5aed27ed427b4425e51105945afe6234"
    },
    {
      id: "classic-display-16130",
      displayId: 16130,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-16130.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/2/16130.webp",
      sha256: "17c0cac3942065346c6c44c236c6ace995b19a9ef7d090a16572cb8721f2f838"
    },
    {
      id: "classic-display-16131",
      displayId: 16131,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-16131.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/3/16131.webp",
      sha256: "2c1da9c2405e21be0fb4bc267c9cef2158f33cf2d19f96a3ecdb2e05b6385edc"
    },
    {
      id: "classic-display-16169",
      displayId: 16169,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-16169.webp",
      sha256: "66a71c6bb5d10197685ed73b60fca06409ce762b428fc6187988fb3f9fbab902",
      width: 300,
      height: 300
    },
    {
      id: "classic-display-16204",
      displayId: 16204,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-16204.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/76/16204.webp",
      sha256: "72ede3bdf3c3bc08d2b46008c0e52e781ca6d7f0908b156d9d94f31454045ff5"
    },
    {
      id: "classic-display-16229",
      displayId: 16229,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-16229.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/101/16229.webp",
      sha256: "eb88be45d1ec9342042c1ebb1322509077ce8c50986ff380782810160aeae1e3"
    },
    {
      id: "classic-display-16233",
      displayId: 16233,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-16233.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/105/16233.webp",
      sha256: "b7bc0cf664c4c1be115981f46da7f90b62c54134c094e09b829303a93ec97129"
    },
    {
      id: "classic-display-16234",
      displayId: 16234,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-16234.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/106/16234.webp",
      sha256: "7378349541b4df7bf4d4ac2560d1641e1980297f43d201c05b2a0612823d546e"
    },
    {
      id: "classic-display-16334",
      displayId: 16334,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-16334.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/206/16334.webp",
      sha256: "629c8f1630ddf3e2f28759bff9ebda5d6987417fdbd91eb7ec0b3a7f9e3bd920"
    },
    {
      id: "classic-display-16336",
      displayId: 16336,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-16336.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/208/16336.webp",
      sha256: "1f658516bb6c0abe3d48dfb2350482e1c49928d63d9fd5d6b608bc055ae5ed19"
    },
    {
      id: "classic-display-16354",
      displayId: 16354,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-16354.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/226/16354.webp",
      sha256: "36ef5db9f626bbc52cd286bd1521377099fb2cfdc170ecb1e7a4503e91feb3a0"
    },
    {
      id: "classic-display-16412",
      displayId: 16412,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-16412.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/28/16412.webp",
      sha256: "c815470de68bb05cfc0a233e6312b77a5956fee29d394313517600ab3abae99a"
    },
    {
      id: "classic-display-17250",
      displayId: 17250,
      kind: "npc-model-render",
      path: "creatures/portraits/classic-display-17250.webp",
      url: "https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/98/17250.webp",
      sha256: "52e3ba65563b7ed430a2b3cd8d0ad2ce8ea664f59d11e9d98a24350620f7da57"
    }
  ],
  entries: {
    "3": {
      entry: 3,
      assetId: "classic-display-987",
      displayId: 987,
      creatureType: 6,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "6": {
      entry: 6,
      assetId: "classic-display-10913",
      displayId: 10913,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "30": {
      entry: 30,
      assetId: "classic-display-382",
      displayId: 382,
      creatureType: 1,
      family: 3,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "36": {
      entry: 36,
      assetId: "classic-display-367",
      displayId: 367,
      creatureType: 9,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "38": {
      entry: 38,
      assetId: "classic-display-5035",
      displayId: 5035,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "40": {
      entry: 40,
      assetId: "classic-display-373",
      displayId: 373,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "43": {
      entry: 43,
      assetId: "classic-display-368",
      displayId: 368,
      creatureType: 1,
      family: 3,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "46": {
      entry: 46,
      assetId: "classic-display-441",
      displayId: 441,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "54": {
      entry: 54,
      assetId: "classic-display-1287",
      displayId: 1287,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "60": {
      entry: 60,
      assetId: "classic-display-2153",
      displayId: 2153,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "61": {
      entry: 61,
      assetId: "classic-display-3341",
      displayId: 3341,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "66": {
      entry: 66,
      assetId: "classic-display-1298",
      displayId: 1298,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "68": {
      entry: 68,
      assetId: "classic-display-3167",
      displayId: 3167,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "69": {
      entry: 69,
      assetId: "classic-display-604",
      displayId: 604,
      creatureType: 1,
      family: 1,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "74": {
      entry: 74,
      assetId: "classic-display-1289",
      displayId: 1289,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "78": {
      entry: 78,
      assetId: "classic-display-3275",
      displayId: 3275,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "79": {
      entry: 79,
      assetId: "classic-display-774",
      displayId: 774,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "80": {
      entry: 80,
      assetId: "classic-display-365",
      displayId: 365,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "89": {
      entry: 89,
      assetId: "classic-display-169",
      displayId: 169,
      creatureType: 3,
      family: 0,
      evidenceLevel: "pinned-local-model-id; Classic page unconfirmed"
    },
    "94": {
      entry: 94,
      assetId: "classic-display-2361",
      displayId: 2361,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "95": {
      entry: 95,
      assetId: "classic-display-4418",
      displayId: 4418,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "97": {
      entry: 97,
      assetId: "classic-display-10791",
      displayId: 10791,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "98": {
      entry: 98,
      assetId: "classic-display-376",
      displayId: 376,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "99": {
      entry: 99,
      assetId: "classic-display-3320",
      displayId: 3320,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "100": {
      entry: 100,
      assetId: "classic-display-175",
      displayId: 175,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "103": {
      entry: 103,
      assetId: "classic-display-2073",
      displayId: 2073,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "113": {
      entry: 113,
      assetId: "classic-display-503",
      displayId: 503,
      creatureType: 1,
      family: 5,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "114": {
      entry: 114,
      assetId: "classic-display-378",
      displayId: 378,
      creatureType: 9,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "115": {
      entry: 115,
      assetId: "classic-display-379",
      displayId: 379,
      creatureType: 9,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "116": {
      entry: 116,
      assetId: "classic-display-2357",
      displayId: 2357,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "117": {
      entry: 117,
      assetId: "classic-display-175",
      displayId: 175,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "118": {
      entry: 118,
      assetId: "classic-display-11415",
      displayId: 11415,
      creatureType: 1,
      family: 1,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "119": {
      entry: 119,
      assetId: "classic-display-381",
      displayId: 381,
      creatureType: 1,
      family: 5,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "121": {
      entry: 121,
      assetId: "classic-display-2336",
      displayId: 2336,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "122": {
      entry: 122,
      assetId: "classic-display-2342",
      displayId: 2342,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "123": {
      entry: 123,
      assetId: "classic-display-383",
      displayId: 383,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "124": {
      entry: 124,
      assetId: "classic-display-384",
      displayId: 384,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "125": {
      entry: 125,
      assetId: "classic-display-10790",
      displayId: 10790,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "126": {
      entry: 126,
      assetId: "classic-display-983",
      displayId: 983,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "127": {
      entry: 127,
      assetId: "classic-display-1995",
      displayId: 1995,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "151": {
      entry: 151,
      assetId: "classic-display-1292",
      displayId: 1292,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "152": {
      entry: 152,
      assetId: "classic-display-3277",
      displayId: 3277,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "154": {
      entry: 154,
      assetId: "classic-display-1105",
      displayId: 1105,
      creatureType: 1,
      family: 7,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "157": {
      entry: 157,
      assetId: "classic-display-3027",
      displayId: 3027,
      creatureType: 1,
      family: 5,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "171": {
      entry: 171,
      assetId: "classic-display-1305",
      displayId: 1305,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "190": {
      entry: 190,
      assetId: "classic-display-3276",
      displayId: 3276,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "196": {
      entry: 196,
      assetId: "classic-display-3251",
      displayId: 3251,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "197": {
      entry: 197,
      assetId: "classic-display-1859",
      displayId: 1859,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "198": {
      entry: 198,
      assetId: "classic-display-5001",
      displayId: 5001,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "199": {
      entry: 199,
      assetId: "classic-display-410",
      displayId: 410,
      creatureType: 1,
      family: 7,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "202": {
      entry: 202,
      assetId: "classic-display-9786",
      displayId: 9786,
      creatureType: 6,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "210": {
      entry: 210,
      assetId: "classic-display-570",
      displayId: 570,
      creatureType: 6,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "213": {
      entry: 213,
      assetId: "classic-display-801",
      displayId: 801,
      creatureType: 1,
      family: 1,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "215": {
      entry: 215,
      assetId: "classic-display-4276",
      displayId: 4276,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "217": {
      entry: 217,
      assetId: "classic-display-955",
      displayId: 955,
      creatureType: 1,
      family: 3,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "218": {
      entry: 218,
      assetId: "classic-display-4275",
      displayId: 4275,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "233": {
      entry: 233,
      assetId: "classic-display-1943",
      displayId: 1943,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "234": {
      entry: 234,
      assetId: "classic-display-1690",
      displayId: 1690,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "235": {
      entry: 235,
      assetId: "classic-display-1691",
      displayId: 1691,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "237": {
      entry: 237,
      assetId: "classic-display-1944",
      displayId: 1944,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "238": {
      entry: 238,
      assetId: "classic-display-1692",
      displayId: 1692,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "239": {
      entry: 239,
      assetId: "classic-display-3265",
      displayId: 3265,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "240": {
      entry: 240,
      assetId: "classic-display-1985",
      displayId: 1985,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "241": {
      entry: 241,
      assetId: "classic-display-3254",
      displayId: 3254,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "244": {
      entry: 244,
      assetId: "classic-display-3330",
      displayId: 3330,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "246": {
      entry: 246,
      assetId: "classic-display-3329",
      displayId: 3329,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "247": {
      entry: 247,
      assetId: "classic-display-221",
      displayId: 221,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "248": {
      entry: 248,
      assetId: "classic-display-2959",
      displayId: 2959,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "250": {
      entry: 250,
      assetId: "classic-display-3327",
      displayId: 3327,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "251": {
      entry: 251,
      assetId: "classic-display-3323",
      displayId: 3323,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "252": {
      entry: 252,
      assetId: "classic-display-3331",
      displayId: 3331,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "253": {
      entry: 253,
      assetId: "classic-display-5038",
      displayId: 5038,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "255": {
      entry: 255,
      assetId: "classic-display-3324",
      displayId: 3324,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "257": {
      entry: 257,
      assetId: "classic-display-10912",
      displayId: 10912,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "258": {
      entry: 258,
      assetId: "classic-display-3328",
      displayId: 3328,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "261": {
      entry: 261,
      assetId: "classic-display-1984",
      displayId: 1984,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "266": {
      entry: 266,
      assetId: "classic-display-1741",
      displayId: 1741,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "277": {
      entry: 277,
      assetId: "classic-display-1433",
      displayId: 1433,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "278": {
      entry: 278,
      assetId: "classic-display-3268",
      displayId: 3268,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "279": {
      entry: 279,
      assetId: "classic-display-5082",
      displayId: 5082,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "285": {
      entry: 285,
      assetId: "classic-display-617",
      displayId: 617,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "288": {
      entry: 288,
      assetId: "classic-display-4325",
      displayId: 4325,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "289": {
      entry: 289,
      assetId: "classic-display-4328",
      displayId: 4328,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "294": {
      entry: 294,
      assetId: "classic-display-1689",
      displayId: 1689,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "295": {
      entry: 295,
      assetId: "classic-display-1291",
      displayId: 1291,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "297": {
      entry: 297,
      assetId: "classic-display-1756",
      displayId: 1756,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "299": {
      entry: 299,
      assetId: "classic-display-447",
      displayId: 447,
      creatureType: 1,
      family: 1,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "311": {
      entry: 311,
      assetId: "classic-display-4327",
      displayId: 4327,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "313": {
      entry: 313,
      assetId: "classic-display-3348",
      displayId: 3348,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "327": {
      entry: 327,
      assetId: "classic-display-2299",
      displayId: 2299,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "328": {
      entry: 328,
      assetId: "classic-display-1294",
      displayId: 1294,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "330": {
      entry: 330,
      assetId: "classic-display-8871",
      displayId: 8871,
      creatureType: 1,
      family: 5,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "331": {
      entry: 331,
      assetId: "classic-display-1484",
      displayId: 1484,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "332": {
      entry: 332,
      assetId: "classic-display-1736",
      displayId: 1736,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "338": {
      entry: 338,
      assetId: "classic-display-5080",
      displayId: 5080,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "340": {
      entry: 340,
      assetId: "classic-display-5728",
      displayId: 5728,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "352": {
      entry: 352,
      assetId: "classic-display-5128",
      displayId: 5128,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "375": {
      entry: 375,
      assetId: "classic-display-3344",
      displayId: 3344,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "376": {
      entry: 376,
      assetId: "classic-display-1495",
      displayId: 1495,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "377": {
      entry: 377,
      assetId: "classic-display-1295",
      displayId: 1295,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "383": {
      entry: 383,
      assetId: "classic-display-3273",
      displayId: 3273,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "384": {
      entry: 384,
      assetId: "classic-display-3270",
      displayId: 3270,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "385": {
      entry: 385,
      assetId: "classic-display-229",
      displayId: 229,
      creatureType: 8,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "390": {
      entry: 390,
      assetId: "classic-display-377",
      displayId: 377,
      creatureType: 1,
      family: 5,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "391": {
      entry: 391,
      assetId: "classic-display-5243",
      displayId: 5243,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "392": {
      entry: 392,
      assetId: "classic-display-1279",
      displayId: 1279,
      creatureType: 6,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "395": {
      entry: 395,
      assetId: "classic-display-262",
      displayId: 262,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "416": {
      entry: 416,
      assetId: "classic-display-4449",
      displayId: 4449,
      creatureType: 3,
      family: 23,
      evidenceLevel: "pinned-local-model-id; Classic page unconfirmed"
    },
    "417": {
      entry: 417,
      assetId: "classic-display-850",
      displayId: 850,
      creatureType: 3,
      family: 15,
      evidenceLevel: "pinned-local-model-id; Classic page unconfirmed"
    },
    "441": {
      entry: 441,
      assetId: "classic-display-387",
      displayId: 387,
      creatureType: 2,
      family: 0,
      evidenceLevel: "pinned-local-model-id; Classic page unconfirmed"
    },
    "448": {
      entry: 448,
      assetId: "classic-display-384",
      displayId: 384,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "449": {
      entry: 449,
      assetId: "classic-display-2344",
      displayId: 2344,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "450": {
      entry: 450,
      assetId: "classic-display-4420",
      displayId: 4420,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "452": {
      entry: 452,
      assetId: "classic-display-383",
      displayId: 383,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "453": {
      entry: 453,
      assetId: "classic-display-502",
      displayId: 502,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "454": {
      entry: 454,
      assetId: "classic-display-8871",
      displayId: 8871,
      creatureType: 1,
      family: 5,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "456": {
      entry: 456,
      assetId: "classic-display-486",
      displayId: 486,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "458": {
      entry: 458,
      assetId: "classic-display-757",
      displayId: 757,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "459": {
      entry: 459,
      assetId: "classic-display-3345",
      displayId: 3345,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "461": {
      entry: 461,
      assetId: "classic-display-1469",
      displayId: 1469,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "462": {
      entry: 462,
      assetId: "classic-display-507",
      displayId: 507,
      creatureType: 1,
      family: 7,
      evidenceLevel: "local-creature-template-model-id"
    },
    "465": {
      entry: 465,
      assetId: "classic-display-3266",
      displayId: 3266,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "466": {
      entry: 466,
      assetId: "classic-display-1688",
      displayId: 1688,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "467": {
      entry: 467,
      assetId: "classic-display-2311",
      displayId: 2311,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "471": {
      entry: 471,
      assetId: "classic-display-2541",
      displayId: 2541,
      creatureType: 1,
      family: 3,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "472": {
      entry: 472,
      assetId: "classic-display-175",
      displayId: 175,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "473": {
      entry: 473,
      assetId: "classic-display-2074",
      displayId: 2074,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "474": {
      entry: 474,
      assetId: "classic-display-2359",
      displayId: 2359,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "475": {
      entry: 475,
      assetId: "classic-display-139",
      displayId: 139,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "476": {
      entry: 476,
      assetId: "classic-display-163",
      displayId: 163,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "478": {
      entry: 478,
      assetId: "classic-display-512",
      displayId: 512,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "480": {
      entry: 480,
      assetId: "classic-display-514",
      displayId: 514,
      creatureType: 9,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "481": {
      entry: 481,
      assetId: "classic-display-2333",
      displayId: 2333,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "482": {
      entry: 482,
      assetId: "classic-display-3246",
      displayId: 3246,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "483": {
      entry: 483,
      assetId: "classic-display-5546",
      displayId: 5546,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "487": {
      entry: 487,
      assetId: "classic-display-2368",
      displayId: 2368,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "488": {
      entry: 488,
      assetId: "classic-display-2371",
      displayId: 2371,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "489": {
      entry: 489,
      assetId: "classic-display-2364",
      displayId: 2364,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "490": {
      entry: 490,
      assetId: "classic-display-2367",
      displayId: 2367,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "491": {
      entry: 491,
      assetId: "classic-display-3342",
      displayId: 3342,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "500": {
      entry: 500,
      assetId: "classic-display-374",
      displayId: 374,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "501": {
      entry: 501,
      assetId: "classic-display-413",
      displayId: 413,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "502": {
      entry: 502,
      assetId: "classic-display-4422",
      displayId: 4422,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "503": {
      entry: 503,
      assetId: "classic-display-10626",
      displayId: 10626,
      creatureType: 6,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "504": {
      entry: 504,
      assetId: "classic-display-2331",
      displayId: 2331,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "506": {
      entry: 506,
      assetId: "classic-display-383",
      displayId: 383,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "513": {
      entry: 513,
      assetId: "classic-display-1994",
      displayId: 1994,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "514": {
      entry: 514,
      assetId: "classic-display-1288",
      displayId: 1288,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "517": {
      entry: 517,
      assetId: "classic-display-1079",
      displayId: 1079,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "520": {
      entry: 520,
      assetId: "classic-display-652",
      displayId: 652,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "521": {
      entry: 521,
      assetId: "classic-display-11412",
      displayId: 11412,
      creatureType: 1,
      family: 1,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "522": {
      entry: 522,
      assetId: "classic-display-612",
      displayId: 612,
      creatureType: 6,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "523": {
      entry: 523,
      assetId: "classic-display-3263",
      displayId: 3263,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "524": {
      entry: 524,
      assetId: "classic-display-389",
      displayId: 389,
      creatureType: 1,
      family: 5,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "525": {
      entry: 525,
      assetId: "classic-display-903",
      displayId: 903,
      creatureType: 1,
      family: 1,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "531": {
      entry: 531,
      assetId: "classic-display-7550",
      displayId: 7550,
      creatureType: 6,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "539": {
      entry: 539,
      assetId: "classic-display-958",
      displayId: 958,
      creatureType: 1,
      family: 3,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "547": {
      entry: 547,
      assetId: "classic-display-3035",
      displayId: 3035,
      creatureType: 1,
      family: 5,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "550": {
      entry: 550,
      assetId: "classic-display-2312",
      displayId: 2312,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "565": {
      entry: 565,
      assetId: "classic-display-802",
      displayId: 802,
      creatureType: 1,
      family: 1,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "569": {
      entry: 569,
      assetId: "classic-display-2541",
      displayId: 2541,
      creatureType: 1,
      family: 3,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "570": {
      entry: 570,
      assetId: "classic-display-569",
      displayId: 569,
      creatureType: 6,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "572": {
      entry: 572,
      assetId: "classic-display-1065",
      displayId: 1065,
      creatureType: 6,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "573": {
      entry: 573,
      assetId: "classic-display-548",
      displayId: 548,
      creatureType: 9,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "582": {
      entry: 582,
      assetId: "classic-display-236",
      displayId: 236,
      creatureType: 8,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "589": {
      entry: 589,
      assetId: "classic-display-2338",
      displayId: 2338,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "590": {
      entry: 590,
      assetId: "classic-display-2340",
      displayId: 2340,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "594": {
      entry: 594,
      assetId: "classic-display-2323",
      displayId: 2323,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "596": {
      entry: 596,
      assetId: "classic-display-3267",
      displayId: 3267,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "598": {
      entry: 598,
      assetId: "classic-display-308",
      displayId: 308,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "599": {
      entry: 599,
      assetId: "classic-display-2355",
      displayId: 2355,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "604": {
      entry: 604,
      assetId: "classic-display-519",
      displayId: 519,
      creatureType: 6,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "619": {
      entry: 619,
      assetId: "classic-display-2329",
      displayId: 2329,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "620": {
      entry: 620,
      assetId: "classic-display-304",
      displayId: 304,
      creatureType: 8,
      family: 0,
      evidenceLevel: "pinned-local-model-id; Classic page unconfirmed"
    },
    "622": {
      entry: 622,
      assetId: "classic-display-7109",
      displayId: 7109,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "623": {
      entry: 623,
      assetId: "classic-display-11402",
      displayId: 11402,
      creatureType: 6,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "624": {
      entry: 624,
      assetId: "classic-display-10630",
      displayId: 10630,
      creatureType: 6,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "625": {
      entry: 625,
      assetId: "classic-display-829",
      displayId: 829,
      creatureType: 6,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "626": {
      entry: 626,
      assetId: "classic-display-10628",
      displayId: 10628,
      creatureType: 6,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "628": {
      entry: 628,
      assetId: "classic-display-741",
      displayId: 741,
      creatureType: 1,
      family: 1,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "634": {
      entry: 634,
      assetId: "classic-display-2316",
      displayId: 2316,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "636": {
      entry: 636,
      assetId: "classic-display-2314",
      displayId: 2314,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "639": {
      entry: 639,
      assetId: "classic-display-2029",
      displayId: 2029,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "641": {
      entry: 641,
      assetId: "classic-display-7111",
      displayId: 7111,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "642": {
      entry: 642,
      assetId: "classic-display-1269",
      displayId: 1269,
      creatureType: 9,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "643": {
      entry: 643,
      assetId: "classic-display-7125",
      displayId: 7125,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "644": {
      entry: 644,
      assetId: "classic-display-14403",
      displayId: 14403,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "645": {
      entry: 645,
      assetId: "classic-display-1305",
      displayId: 1305,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "646": {
      entry: 646,
      assetId: "classic-display-2026",
      displayId: 2026,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "647": {
      entry: 647,
      assetId: "classic-display-7113",
      displayId: 7113,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "656": {
      entry: 656,
      assetId: "classic-display-2363",
      displayId: 2363,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "657": {
      entry: 657,
      assetId: "classic-display-2347",
      displayId: 2347,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "688": {
      entry: 688,
      assetId: "classic-display-12344",
      displayId: 12344,
      creatureType: 1,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "721": {
      entry: 721,
      assetId: "classic-display-328",
      displayId: 328,
      creatureType: 8,
      family: 0,
      evidenceLevel: "pinned-local-model-id; Classic page unconfirmed"
    },
    "732": {
      entry: 732,
      assetId: "classic-display-983",
      displayId: 983,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "735": {
      entry: 735,
      assetId: "classic-display-527",
      displayId: 527,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "771": {
      entry: 771,
      assetId: "classic-display-7848",
      displayId: 7848,
      creatureType: 6,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "785": {
      entry: 785,
      assetId: "classic-display-612",
      displayId: 612,
      creatureType: 6,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "787": {
      entry: 787,
      assetId: "classic-display-7555",
      displayId: 7555,
      creatureType: 6,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "794": {
      entry: 794,
      assetId: "classic-display-338",
      displayId: 338,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "795": {
      entry: 795,
      assetId: "classic-display-338",
      displayId: 338,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "796": {
      entry: 796,
      assetId: "classic-display-221",
      displayId: 221,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "797": {
      entry: 797,
      assetId: "classic-display-338",
      displayId: 338,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "798": {
      entry: 798,
      assetId: "classic-display-221",
      displayId: 221,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "799": {
      entry: 799,
      assetId: "classic-display-338",
      displayId: 338,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "800": {
      entry: 800,
      assetId: "classic-display-338",
      displayId: 338,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "801": {
      entry: 801,
      assetId: "classic-display-262",
      displayId: 262,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "802": {
      entry: 802,
      assetId: "classic-display-221",
      displayId: 221,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "804": {
      entry: 804,
      assetId: "classic-display-257",
      displayId: 257,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "805": {
      entry: 805,
      assetId: "classic-display-262",
      displayId: 262,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "806": {
      entry: 806,
      assetId: "classic-display-338",
      displayId: 338,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "807": {
      entry: 807,
      assetId: "classic-display-252",
      displayId: 252,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "810": {
      entry: 810,
      assetId: "classic-display-338",
      displayId: 338,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "811": {
      entry: 811,
      assetId: "classic-display-221",
      displayId: 221,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "820": {
      entry: 820,
      assetId: "classic-display-2374",
      displayId: 2374,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "821": {
      entry: 821,
      assetId: "classic-display-2372",
      displayId: 2372,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "822": {
      entry: 822,
      assetId: "classic-display-1006",
      displayId: 1006,
      creatureType: 1,
      family: 4,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "823": {
      entry: 823,
      assetId: "classic-display-2072",
      displayId: 2072,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "824": {
      entry: 824,
      assetId: "classic-display-2441",
      displayId: 2441,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "831": {
      entry: 831,
      assetId: "classic-display-979",
      displayId: 979,
      creatureType: 1,
      family: 8,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "832": {
      entry: 832,
      assetId: "classic-display-5327",
      displayId: 5327,
      creatureType: 4,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "833": {
      entry: 833,
      assetId: "classic-display-161",
      displayId: 161,
      creatureType: 1,
      family: 1,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "834": {
      entry: 834,
      assetId: "classic-display-643",
      displayId: 643,
      creatureType: 1,
      family: 1,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "842": {
      entry: 842,
      assetId: "classic-display-308",
      displayId: 308,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "843": {
      entry: 843,
      assetId: "classic-display-3260",
      displayId: 3260,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "844": {
      entry: 844,
      assetId: "classic-display-4416",
      displayId: 4416,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "846": {
      entry: 846,
      assetId: "classic-display-646",
      displayId: 646,
      creatureType: 6,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "869": {
      entry: 869,
      assetId: "classic-display-2366",
      displayId: 2366,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "870": {
      entry: 870,
      assetId: "classic-display-2365",
      displayId: 2365,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "874": {
      entry: 874,
      assetId: "classic-display-2369",
      displayId: 2369,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "876": {
      entry: 876,
      assetId: "classic-display-2370",
      displayId: 2370,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "878": {
      entry: 878,
      assetId: "classic-display-2373",
      displayId: 2373,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "880": {
      entry: 880,
      assetId: "classic-display-3322",
      displayId: 3322,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "881": {
      entry: 881,
      assetId: "classic-display-3321",
      displayId: 3321,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "883": {
      entry: 883,
      assetId: "classic-display-347",
      displayId: 347,
      creatureType: 8,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "890": {
      entry: 890,
      assetId: "classic-display-654",
      displayId: 654,
      creatureType: 8,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "893": {
      entry: 893,
      assetId: "classic-display-4329",
      displayId: 4329,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "894": {
      entry: 894,
      assetId: "classic-display-3332",
      displayId: 3332,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "896": {
      entry: 896,
      assetId: "classic-display-3339",
      displayId: 3339,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "898": {
      entry: 898,
      assetId: "classic-display-657",
      displayId: 657,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "906": {
      entry: 906,
      assetId: "classic-display-3271",
      displayId: 3271,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "909": {
      entry: 909,
      assetId: "classic-display-4279",
      displayId: 4279,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "910": {
      entry: 910,
      assetId: "classic-display-4281",
      displayId: 4281,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "911": {
      entry: 911,
      assetId: "classic-display-3343",
      displayId: 3343,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "913": {
      entry: 913,
      assetId: "classic-display-1300",
      displayId: 1300,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "914": {
      entry: 914,
      assetId: "classic-display-1504",
      displayId: 1504,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "915": {
      entry: 915,
      assetId: "classic-display-3351",
      displayId: 3351,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "917": {
      entry: 917,
      assetId: "classic-display-1297",
      displayId: 1297,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "918": {
      entry: 918,
      assetId: "classic-display-1507",
      displayId: 1507,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "923": {
      entry: 923,
      assetId: "classic-display-246",
      displayId: 246,
      creatureType: 1,
      family: 1,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "925": {
      entry: 925,
      assetId: "classic-display-3346",
      displayId: 3346,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "927": {
      entry: 927,
      assetId: "classic-display-1299",
      displayId: 1299,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "928": {
      entry: 928,
      assetId: "classic-display-1499",
      displayId: 1499,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "930": {
      entry: 930,
      assetId: "classic-display-368",
      displayId: 368,
      creatureType: 1,
      family: 3,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "948": {
      entry: 948,
      assetId: "classic-display-137",
      displayId: 137,
      creatureType: 6,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "949": {
      entry: 949,
      assetId: "classic-display-545",
      displayId: 545,
      creatureType: 1,
      family: 3,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "951": {
      entry: 951,
      assetId: "classic-display-3253",
      displayId: 3253,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "952": {
      entry: 952,
      assetId: "classic-display-3317",
      displayId: 3317,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "955": {
      entry: 955,
      assetId: "classic-display-3338",
      displayId: 3338,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "957": {
      entry: 957,
      assetId: "classic-display-3354",
      displayId: 3354,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "958": {
      entry: 958,
      assetId: "classic-display-3347",
      displayId: 3347,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "959": {
      entry: 959,
      assetId: "classic-display-5012",
      displayId: 5012,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "963": {
      entry: 963,
      assetId: "classic-display-3279",
      displayId: 3279,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1015": {
      entry: 1015,
      assetId: "classic-display-670",
      displayId: 670,
      creatureType: 1,
      family: 11,
      evidenceLevel: "pinned-local-model-id; Classic page unconfirmed"
    },
    "1030": {
      entry: 1030,
      assetId: "classic-display-360",
      displayId: 360,
      creatureType: 10,
      family: 0,
      evidenceLevel: "pinned-local-model-id; Classic page unconfirmed"
    },
    "1039": {
      entry: 1039,
      assetId: "classic-display-713",
      displayId: 713,
      creatureType: 4,
      family: 0,
      evidenceLevel: "pinned-local-model-id; Classic page unconfirmed"
    },
    "1065": {
      entry: 1065,
      assetId: "classic-display-204",
      displayId: 204,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "1103": {
      entry: 1103,
      assetId: "classic-display-1290",
      displayId: 1290,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1109": {
      entry: 1109,
      assetId: "classic-display-2305",
      displayId: 2305,
      creatureType: 1,
      family: 7,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "1110": {
      entry: 1110,
      assetId: "classic-display-734",
      displayId: 734,
      creatureType: 6,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1141": {
      entry: 1141,
      assetId: "classic-display-5073",
      displayId: 5073,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1198": {
      entry: 1198,
      assetId: "classic-display-5014",
      displayId: 5014,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1199": {
      entry: 1199,
      assetId: "classic-display-748",
      displayId: 748,
      creatureType: 1,
      family: 2,
      evidenceLevel: "pinned-local-model-id; Classic page unconfirmed"
    },
    "1200": {
      entry: 1200,
      assetId: "classic-display-4272",
      displayId: 4272,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1205": {
      entry: 1205,
      assetId: "classic-display-1194",
      displayId: 1194,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1212": {
      entry: 1212,
      assetId: "classic-display-5548",
      displayId: 5548,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1213": {
      entry: 1213,
      assetId: "classic-display-3278",
      displayId: 3278,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1215": {
      entry: 1215,
      assetId: "classic-display-3237",
      displayId: 3237,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1216": {
      entry: 1216,
      assetId: "classic-display-9570",
      displayId: 9570,
      creatureType: 1,
      family: 8,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "1218": {
      entry: 1218,
      assetId: "classic-display-3269",
      displayId: 3269,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1228": {
      entry: 1228,
      assetId: "classic-display-10215",
      displayId: 10215,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1236": {
      entry: 1236,
      assetId: "classic-display-373",
      displayId: 373,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "1249": {
      entry: 1249,
      assetId: "classic-display-3337",
      displayId: 3337,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1250": {
      entry: 1250,
      assetId: "classic-display-3326",
      displayId: 3326,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1257": {
      entry: 1257,
      assetId: "classic-display-1431",
      displayId: 1431,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1275": {
      entry: 1275,
      assetId: "classic-display-1444",
      displayId: 1444,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1284": {
      entry: 1284,
      assetId: "classic-display-5072",
      displayId: 5072,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1285": {
      entry: 1285,
      assetId: "classic-display-1434",
      displayId: 1434,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1286": {
      entry: 1286,
      assetId: "classic-display-1440",
      displayId: 1440,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1287": {
      entry: 1287,
      assetId: "classic-display-1448",
      displayId: 1448,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1289": {
      entry: 1289,
      assetId: "classic-display-1429",
      displayId: 1429,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1291": {
      entry: 1291,
      assetId: "classic-display-1439",
      displayId: 1439,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1292": {
      entry: 1292,
      assetId: "classic-display-1449",
      displayId: 1449,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1294": {
      entry: 1294,
      assetId: "classic-display-1423",
      displayId: 1423,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1295": {
      entry: 1295,
      assetId: "classic-display-1445",
      displayId: 1445,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1297": {
      entry: 1297,
      assetId: "classic-display-1446",
      displayId: 1446,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1298": {
      entry: 1298,
      assetId: "classic-display-1427",
      displayId: 1427,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1299": {
      entry: 1299,
      assetId: "classic-display-1447",
      displayId: 1447,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1300": {
      entry: 1300,
      assetId: "classic-display-1432",
      displayId: 1432,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1301": {
      entry: 1301,
      assetId: "classic-display-1443",
      displayId: 1443,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1302": {
      entry: 1302,
      assetId: "classic-display-1425",
      displayId: 1425,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1303": {
      entry: 1303,
      assetId: "classic-display-1441",
      displayId: 1441,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1304": {
      entry: 1304,
      assetId: "classic-display-1487",
      displayId: 1487,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1305": {
      entry: 1305,
      assetId: "classic-display-1490",
      displayId: 1490,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1307": {
      entry: 1307,
      assetId: "classic-display-1480",
      displayId: 1480,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1308": {
      entry: 1308,
      assetId: "classic-display-1494",
      displayId: 1494,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1309": {
      entry: 1309,
      assetId: "classic-display-1483",
      displayId: 1483,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1310": {
      entry: 1310,
      assetId: "classic-display-1489",
      displayId: 1489,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1311": {
      entry: 1311,
      assetId: "classic-display-1491",
      displayId: 1491,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1312": {
      entry: 1312,
      assetId: "classic-display-1477",
      displayId: 1477,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1313": {
      entry: 1313,
      assetId: "classic-display-1482",
      displayId: 1482,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1314": {
      entry: 1314,
      assetId: "classic-display-1488",
      displayId: 1488,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1315": {
      entry: 1315,
      assetId: "classic-display-1486",
      displayId: 1486,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1316": {
      entry: 1316,
      assetId: "classic-display-1485",
      displayId: 1485,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1317": {
      entry: 1317,
      assetId: "classic-display-1492",
      displayId: 1492,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1318": {
      entry: 1318,
      assetId: "classic-display-1481",
      displayId: 1481,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1319": {
      entry: 1319,
      assetId: "classic-display-1510",
      displayId: 1510,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1320": {
      entry: 1320,
      assetId: "classic-display-1517",
      displayId: 1517,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1321": {
      entry: 1321,
      assetId: "classic-display-1520",
      displayId: 1520,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1323": {
      entry: 1323,
      assetId: "classic-display-1515",
      displayId: 1515,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1324": {
      entry: 1324,
      assetId: "classic-display-1512",
      displayId: 1512,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1325": {
      entry: 1325,
      assetId: "classic-display-1513",
      displayId: 1513,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1326": {
      entry: 1326,
      assetId: "classic-display-1523",
      displayId: 1523,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1327": {
      entry: 1327,
      assetId: "classic-display-1516",
      displayId: 1516,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1328": {
      entry: 1328,
      assetId: "classic-display-1521",
      displayId: 1521,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1333": {
      entry: 1333,
      assetId: "classic-display-1511",
      displayId: 1511,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1339": {
      entry: 1339,
      assetId: "classic-display-1522",
      displayId: 1522,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1341": {
      entry: 1341,
      assetId: "classic-display-1518",
      displayId: 1518,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1343": {
      entry: 1343,
      assetId: "classic-display-1894",
      displayId: 1894,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1346": {
      entry: 1346,
      assetId: "classic-display-1502",
      displayId: 1502,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1347": {
      entry: 1347,
      assetId: "classic-display-1497",
      displayId: 1497,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1348": {
      entry: 1348,
      assetId: "classic-display-1503",
      displayId: 1503,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1349": {
      entry: 1349,
      assetId: "classic-display-1500",
      displayId: 1500,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1350": {
      entry: 1350,
      assetId: "classic-display-1498",
      displayId: 1498,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1351": {
      entry: 1351,
      assetId: "classic-display-1501",
      displayId: 1501,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1366": {
      entry: 1366,
      assetId: "classic-display-338",
      displayId: 338,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1367": {
      entry: 1367,
      assetId: "classic-display-221",
      displayId: 221,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1368": {
      entry: 1368,
      assetId: "classic-display-221",
      displayId: 221,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1370": {
      entry: 1370,
      assetId: "classic-display-338",
      displayId: 338,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1371": {
      entry: 1371,
      assetId: "classic-display-262",
      displayId: 262,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1395": {
      entry: 1395,
      assetId: "classic-display-1508",
      displayId: 1508,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1400": {
      entry: 1400,
      assetId: "classic-display-1036",
      displayId: 1036,
      creatureType: 1,
      family: 6,
      evidenceLevel: "pinned-local-model-id; Classic page unconfirmed"
    },
    "1402": {
      entry: 1402,
      assetId: "classic-display-1438",
      displayId: 1438,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1405": {
      entry: 1405,
      assetId: "classic-display-1524",
      displayId: 1524,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1412": {
      entry: 1412,
      assetId: "classic-display-134",
      displayId: 134,
      creatureType: 8,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1413": {
      entry: 1413,
      assetId: "classic-display-1472",
      displayId: 1472,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1414": {
      entry: 1414,
      assetId: "classic-display-1473",
      displayId: 1473,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1415": {
      entry: 1415,
      assetId: "classic-display-2038",
      displayId: 2038,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1416": {
      entry: 1416,
      assetId: "classic-display-4998",
      displayId: 4998,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1419": {
      entry: 1419,
      assetId: "classic-display-328",
      displayId: 328,
      creatureType: 1,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1423": {
      entry: 1423,
      assetId: "classic-display-3258",
      displayId: 3258,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1424": {
      entry: 1424,
      assetId: "classic-display-774",
      displayId: 774,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "1426": {
      entry: 1426,
      assetId: "classic-display-374",
      displayId: 374,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "1427": {
      entry: 1427,
      assetId: "classic-display-5551",
      displayId: 5551,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1428": {
      entry: 1428,
      assetId: "classic-display-5552",
      displayId: 5552,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1429": {
      entry: 1429,
      assetId: "classic-display-221",
      displayId: 221,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1430": {
      entry: 1430,
      assetId: "classic-display-1293",
      displayId: 1293,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1431": {
      entry: 1431,
      assetId: "classic-display-5545",
      displayId: 5545,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1432": {
      entry: 1432,
      assetId: "classic-display-5074",
      displayId: 5074,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1435": {
      entry: 1435,
      assetId: "classic-display-1765",
      displayId: 1765,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1439": {
      entry: 1439,
      assetId: "classic-display-1758",
      displayId: 1758,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1440": {
      entry: 1440,
      assetId: "classic-display-5553",
      displayId: 5553,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1444": {
      entry: 1444,
      assetId: "classic-display-5549",
      displayId: 5549,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1472": {
      entry: 1472,
      assetId: "classic-display-5570",
      displayId: 5570,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1477": {
      entry: 1477,
      assetId: "classic-display-1509",
      displayId: 1509,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1478": {
      entry: 1478,
      assetId: "classic-display-1519",
      displayId: 1519,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1512": {
      entry: 1512,
      assetId: "classic-display-4732",
      displayId: 4732,
      creatureType: 1,
      family: 24,
      evidenceLevel: "pinned-local-model-id; Classic page unconfirmed"
    },
    "1632": {
      entry: 1632,
      assetId: "classic-display-3335",
      displayId: 3335,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1642": {
      entry: 1642,
      assetId: "classic-display-3167",
      displayId: 3167,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1645": {
      entry: 1645,
      assetId: "classic-display-3336",
      displayId: 3336,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1646": {
      entry: 1646,
      assetId: "classic-display-1357",
      displayId: 1357,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1650": {
      entry: 1650,
      assetId: "classic-display-5032",
      displayId: 5032,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1651": {
      entry: 1651,
      assetId: "classic-display-3272",
      displayId: 3272,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1668": {
      entry: 1668,
      assetId: "classic-display-3259",
      displayId: 3259,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1669": {
      entry: 1669,
      assetId: "classic-display-4423",
      displayId: 4423,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1670": {
      entry: 1670,
      assetId: "classic-display-3262",
      displayId: 3262,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1719": {
      entry: 1719,
      assetId: "classic-display-1865",
      displayId: 1865,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1721": {
      entry: 1721,
      assetId: "classic-display-1815",
      displayId: 1815,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1725": {
      entry: 1725,
      assetId: "classic-display-184",
      displayId: 184,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "1726": {
      entry: 1726,
      assetId: "classic-display-2321",
      displayId: 2321,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "1727": {
      entry: 1727,
      assetId: "classic-display-341",
      displayId: 341,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "1729": {
      entry: 1729,
      assetId: "classic-display-2318",
      displayId: 2318,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "1731": {
      entry: 1731,
      assetId: "classic-display-7110",
      displayId: 7110,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "1732": {
      entry: 1732,
      assetId: "classic-display-2349",
      displayId: 2349,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "1733": {
      entry: 1733,
      assetId: "classic-display-4449",
      displayId: 4449,
      creatureType: 3,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1747": {
      entry: 1747,
      assetId: "classic-display-11655",
      displayId: 11655,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1748": {
      entry: 1748,
      assetId: "classic-display-5566",
      displayId: 5566,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1749": {
      entry: 1749,
      assetId: "classic-display-8769",
      displayId: 8769,
      creatureType: 2,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1750": {
      entry: 1750,
      assetId: "classic-display-5565",
      displayId: 5565,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1751": {
      entry: 1751,
      assetId: "classic-display-5077",
      displayId: 5077,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1752": {
      entry: 1752,
      assetId: "classic-display-4731",
      displayId: 4731,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1754": {
      entry: 1754,
      assetId: "classic-display-2051",
      displayId: 2051,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1756": {
      entry: 1756,
      assetId: "classic-display-3167",
      displayId: 3167,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1763": {
      entry: 1763,
      assetId: "classic-display-7124",
      displayId: 7124,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "1860": {
      entry: 1860,
      assetId: "classic-display-1132",
      displayId: 1132,
      creatureType: 3,
      family: 16,
      evidenceLevel: "pinned-local-model-id; Classic page unconfirmed"
    },
    "1863": {
      entry: 1863,
      assetId: "classic-display-4162",
      displayId: 4162,
      creatureType: 3,
      family: 17,
      evidenceLevel: "pinned-local-model-id; Classic page unconfirmed"
    },
    "1922": {
      entry: 1922,
      assetId: "classic-display-380",
      displayId: 380,
      creatureType: 1,
      family: 1,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "1933": {
      entry: 1933,
      assetId: "classic-display-856",
      displayId: 856,
      creatureType: 8,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1949": {
      entry: 1949,
      assetId: "classic-display-5015",
      displayId: 5015,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1953": {
      entry: 1953,
      assetId: "classic-display-863",
      displayId: 863,
      creatureType: 4,
      family: 0,
      evidenceLevel: "pinned-local-model-id; Classic page unconfirmed"
    },
    "1975": {
      entry: 1975,
      assetId: "classic-display-5034",
      displayId: 5034,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1976": {
      entry: 1976,
      assetId: "classic-display-3167",
      displayId: 3167,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "1995": {
      entry: 1995,
      assetId: "classic-display-10832",
      displayId: 10832,
      creatureType: 1,
      family: 26,
      evidenceLevel: "pinned-local-model-id; Classic page unconfirmed"
    },
    "2046": {
      entry: 2046,
      assetId: "classic-display-3340",
      displayId: 3340,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "2110": {
      entry: 2110,
      assetId: "classic-display-1141",
      displayId: 1141,
      creatureType: 8,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "2142": {
      entry: 2142,
      assetId: "classic-display-2377",
      displayId: 2377,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "2172": {
      entry: 2172,
      assetId: "classic-display-38",
      displayId: 38,
      creatureType: 1,
      family: 12,
      evidenceLevel: "pinned-local-model-id; Classic page unconfirmed"
    },
    "2198": {
      entry: 2198,
      assetId: "classic-display-1525",
      displayId: 1525,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "2285": {
      entry: 2285,
      assetId: "classic-display-5075",
      displayId: 5075,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "2327": {
      entry: 2327,
      assetId: "classic-display-1496",
      displayId: 1496,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "2329": {
      entry: 2329,
      assetId: "classic-display-1296",
      displayId: 1296,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "2330": {
      entry: 2330,
      assetId: "classic-display-1471",
      displayId: 1471,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "2331": {
      entry: 2331,
      assetId: "classic-display-252",
      displayId: 252,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "2334": {
      entry: 2334,
      assetId: "classic-display-11686",
      displayId: 11686,
      creatureType: 10,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "2439": {
      entry: 2439,
      assetId: "classic-display-5567",
      displayId: 5567,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "2442": {
      entry: 2442,
      assetId: "classic-display-1060",
      displayId: 1060,
      creatureType: 8,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "2455": {
      entry: 2455,
      assetId: "classic-display-1450",
      displayId: 1450,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "2456": {
      entry: 2456,
      assetId: "classic-display-1436",
      displayId: 1436,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "2457": {
      entry: 2457,
      assetId: "classic-display-1437",
      displayId: 1437,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "2481": {
      entry: 2481,
      assetId: "classic-display-7130",
      displayId: 7130,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "2485": {
      entry: 2485,
      assetId: "classic-display-1470",
      displayId: 1470,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "2504": {
      entry: 2504,
      assetId: "classic-display-1573",
      displayId: 1573,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "2532": {
      entry: 2532,
      assetId: "classic-display-252",
      displayId: 252,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "2533": {
      entry: 2533,
      assetId: "classic-display-262",
      displayId: 262,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "2620": {
      entry: 2620,
      assetId: "classic-display-1072",
      displayId: 1072,
      creatureType: 8,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "2708": {
      entry: 2708,
      assetId: "classic-display-2968",
      displayId: 2968,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "2795": {
      entry: 2795,
      assetId: "classic-display-1505",
      displayId: 1505,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "2879": {
      entry: 2879,
      assetId: "classic-display-5043",
      displayId: 5043,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "2914": {
      entry: 2914,
      assetId: "classic-display-1206",
      displayId: 1206,
      creatureType: 8,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "3094": {
      entry: 3094,
      assetId: "classic-display-146",
      displayId: 146,
      creatureType: 6,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "3102": {
      entry: 3102,
      assetId: "classic-display-850",
      displayId: 850,
      creatureType: 3,
      family: 15,
      evidenceLevel: "pinned-local-model-id; Classic page unconfirmed"
    },
    "3124": {
      entry: 3124,
      assetId: "classic-display-2485",
      displayId: 2485,
      creatureType: 1,
      family: 20,
      evidenceLevel: "pinned-local-model-id; Classic page unconfirmed"
    },
    "3134": {
      entry: 3134,
      assetId: "classic-display-7131",
      displayId: 7131,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "3247": {
      entry: 3247,
      assetId: "classic-display-1742",
      displayId: 1742,
      creatureType: 1,
      family: 27,
      evidenceLevel: "pinned-local-model-id; Classic page unconfirmed"
    },
    "3461": {
      entry: 3461,
      assetId: "classic-display-6368",
      displayId: 6368,
      creatureType: 1,
      family: 21,
      evidenceLevel: "pinned-local-model-id; Classic page unconfirmed"
    },
    "3504": {
      entry: 3504,
      assetId: "classic-display-338",
      displayId: 338,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "3505": {
      entry: 3505,
      assetId: "classic-display-257",
      displayId: 257,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "3507": {
      entry: 3507,
      assetId: "classic-display-252",
      displayId: 252,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "3508": {
      entry: 3508,
      assetId: "classic-display-251",
      displayId: 251,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "3509": {
      entry: 3509,
      assetId: "classic-display-338",
      displayId: 338,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "3510": {
      entry: 3510,
      assetId: "classic-display-221",
      displayId: 221,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "3511": {
      entry: 3511,
      assetId: "classic-display-262",
      displayId: 262,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "3512": {
      entry: 3512,
      assetId: "classic-display-251",
      displayId: 251,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "3513": {
      entry: 3513,
      assetId: "classic-display-1526",
      displayId: 1526,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "3518": {
      entry: 3518,
      assetId: "classic-display-1541",
      displayId: 1541,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "3520": {
      entry: 3520,
      assetId: "classic-display-1544",
      displayId: 1544,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "3581": {
      entry: 3581,
      assetId: "classic-display-2850",
      displayId: 2850,
      creatureType: 1,
      family: 6,
      evidenceLevel: "local-creature-template-model-id"
    },
    "3586": {
      entry: 3586,
      assetId: "classic-display-556",
      displayId: 556,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "3626": {
      entry: 3626,
      assetId: "classic-display-1697",
      displayId: 1697,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "3627": {
      entry: 3627,
      assetId: "classic-display-1694",
      displayId: 1694,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "3628": {
      entry: 3628,
      assetId: "classic-display-1695",
      displayId: 1695,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "3629": {
      entry: 3629,
      assetId: "classic-display-1696",
      displayId: 1696,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "3935": {
      entry: 3935,
      assetId: "classic-display-3236",
      displayId: 3236,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "3937": {
      entry: 3937,
      assetId: "classic-display-3234",
      displayId: 3234,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "3947": {
      entry: 3947,
      assetId: "classic-display-7112",
      displayId: 7112,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "4075": {
      entry: 4075,
      assetId: "classic-display-1141",
      displayId: 1141,
      creatureType: 8,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "4078": {
      entry: 4078,
      assetId: "classic-display-2181",
      displayId: 2181,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "4127": {
      entry: 4127,
      assetId: "classic-display-2710",
      displayId: 2710,
      creatureType: 1,
      family: 25,
      evidenceLevel: "pinned-local-model-id; Classic page unconfirmed"
    },
    "4416": {
      entry: 4416,
      assetId: "classic-display-2438",
      displayId: 2438,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "4417": {
      entry: 4417,
      assetId: "classic-display-2440",
      displayId: 2440,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "4418": {
      entry: 4418,
      assetId: "classic-display-2447",
      displayId: 2447,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "4732": {
      entry: 4732,
      assetId: "classic-display-3274",
      displayId: 3274,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "4959": {
      entry: 4959,
      assetId: "classic-display-4469",
      displayId: 4469,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "4960": {
      entry: 4960,
      assetId: "classic-display-2961",
      displayId: 2961,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "4961": {
      entry: 4961,
      assetId: "classic-display-3238",
      displayId: 3238,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "4974": {
      entry: 4974,
      assetId: "classic-display-2974",
      displayId: 2974,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "4981": {
      entry: 4981,
      assetId: "classic-display-5547",
      displayId: 5547,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "4982": {
      entry: 4982,
      assetId: "classic-display-262",
      displayId: 262,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "4984": {
      entry: 4984,
      assetId: "classic-display-5078",
      displayId: 5078,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "4995": {
      entry: 4995,
      assetId: "classic-display-2989",
      displayId: 2989,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "4996": {
      entry: 4996,
      assetId: "classic-display-2985",
      displayId: 2985,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "5042": {
      entry: 5042,
      assetId: "classic-display-2993",
      displayId: 2993,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "5043": {
      entry: 5043,
      assetId: "classic-display-2148",
      displayId: 2148,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "5081": {
      entry: 5081,
      assetId: "classic-display-3010",
      displayId: 3010,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "5193": {
      entry: 5193,
      assetId: "classic-display-3133",
      displayId: 3133,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "5384": {
      entry: 5384,
      assetId: "classic-display-5079",
      displayId: 5079,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "5386": {
      entry: 5386,
      assetId: "classic-display-5081",
      displayId: 5081,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "5403": {
      entry: 5403,
      assetId: "classic-display-2410",
      displayId: 2410,
      creatureType: 1,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "5405": {
      entry: 5405,
      assetId: "classic-display-2409",
      displayId: 2409,
      creatureType: 1,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "5406": {
      entry: 5406,
      assetId: "classic-display-2408",
      displayId: 2408,
      creatureType: 1,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "5413": {
      entry: 5413,
      assetId: "classic-display-4997",
      displayId: 4997,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "5479": {
      entry: 5479,
      assetId: "classic-display-3280",
      displayId: 3280,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "5480": {
      entry: 5480,
      assetId: "classic-display-3287",
      displayId: 3287,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "5482": {
      entry: 5482,
      assetId: "classic-display-3281",
      displayId: 3281,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "5483": {
      entry: 5483,
      assetId: "classic-display-3288",
      displayId: 3288,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "5484": {
      entry: 5484,
      assetId: "classic-display-3282",
      displayId: 3282,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "5489": {
      entry: 5489,
      assetId: "classic-display-3283",
      displayId: 3283,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "5491": {
      entry: 5491,
      assetId: "classic-display-3284",
      displayId: 3284,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "5492": {
      entry: 5492,
      assetId: "classic-display-3289",
      displayId: 3289,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "5493": {
      entry: 5493,
      assetId: "classic-display-3285",
      displayId: 3285,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "5494": {
      entry: 5494,
      assetId: "classic-display-3290",
      displayId: 3290,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "5495": {
      entry: 5495,
      assetId: "classic-display-3291",
      displayId: 3291,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "5496": {
      entry: 5496,
      assetId: "classic-display-3286",
      displayId: 3286,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "5497": {
      entry: 5497,
      assetId: "classic-display-3292",
      displayId: 3292,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "5498": {
      entry: 5498,
      assetId: "classic-display-3293",
      displayId: 3293,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "5499": {
      entry: 5499,
      assetId: "classic-display-3295",
      displayId: 3295,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "5500": {
      entry: 5500,
      assetId: "classic-display-3298",
      displayId: 3298,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "5502": {
      entry: 5502,
      assetId: "classic-display-3296",
      displayId: 3296,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "5503": {
      entry: 5503,
      assetId: "classic-display-3297",
      displayId: 3297,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "5504": {
      entry: 5504,
      assetId: "classic-display-3300",
      displayId: 3300,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "5505": {
      entry: 5505,
      assetId: "classic-display-3301",
      displayId: 3301,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "5506": {
      entry: 5506,
      assetId: "classic-display-3302",
      displayId: 3302,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "5509": {
      entry: 5509,
      assetId: "classic-display-3305",
      displayId: 3305,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "5510": {
      entry: 5510,
      assetId: "classic-display-3306",
      displayId: 3306,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "5511": {
      entry: 5511,
      assetId: "classic-display-3307",
      displayId: 3307,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "5512": {
      entry: 5512,
      assetId: "classic-display-3311",
      displayId: 3311,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "5513": {
      entry: 5513,
      assetId: "classic-display-3308",
      displayId: 3308,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "5514": {
      entry: 5514,
      assetId: "classic-display-3313",
      displayId: 3313,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "5515": {
      entry: 5515,
      assetId: "classic-display-3312",
      displayId: 3312,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "5516": {
      entry: 5516,
      assetId: "classic-display-3309",
      displayId: 3309,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "5517": {
      entry: 5517,
      assetId: "classic-display-3310",
      displayId: 3310,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "5518": {
      entry: 5518,
      assetId: "classic-display-3314",
      displayId: 3314,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "5519": {
      entry: 5519,
      assetId: "classic-display-3315",
      displayId: 3315,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "5520": {
      entry: 5520,
      assetId: "classic-display-3316",
      displayId: 3316,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "5564": {
      entry: 5564,
      assetId: "classic-display-3449",
      displayId: 3449,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "5565": {
      entry: 5565,
      assetId: "classic-display-3448",
      displayId: 3448,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "5566": {
      entry: 5566,
      assetId: "classic-display-3445",
      displayId: 3445,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "5567": {
      entry: 5567,
      assetId: "classic-display-3444",
      displayId: 3444,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "5694": {
      entry: 5694,
      assetId: "classic-display-5076",
      displayId: 5076,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "5917": {
      entry: 5917,
      assetId: "classic-display-4558",
      displayId: 4558,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "6089": {
      entry: 6089,
      assetId: "classic-display-4996",
      displayId: 4996,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "6090": {
      entry: 6090,
      assetId: "classic-display-5000",
      displayId: 5e3,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "6093": {
      entry: 6093,
      assetId: "classic-display-4947",
      displayId: 4947,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "6121": {
      entry: 6121,
      assetId: "classic-display-4866",
      displayId: 4866,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "6122": {
      entry: 6122,
      assetId: "classic-display-4867",
      displayId: 4867,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "6171": {
      entry: 6171,
      assetId: "classic-display-4885",
      displayId: 4885,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "6172": {
      entry: 6172,
      assetId: "classic-display-4886",
      displayId: 4886,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "6173": {
      entry: 6173,
      assetId: "classic-display-4887",
      displayId: 4887,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "6174": {
      entry: 6174,
      assetId: "classic-display-4888",
      displayId: 4888,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "6237": {
      entry: 6237,
      assetId: "classic-display-2989",
      displayId: 2989,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "6267": {
      entry: 6267,
      assetId: "classic-display-4951",
      displayId: 4951,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "6271": {
      entry: 6271,
      assetId: "classic-display-4959",
      displayId: 4959,
      creatureType: 8,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "6306": {
      entry: 6306,
      assetId: "classic-display-5365",
      displayId: 5365,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "6367": {
      entry: 6367,
      assetId: "classic-display-5086",
      displayId: 5086,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "6368": {
      entry: 6368,
      assetId: "classic-display-5585",
      displayId: 5585,
      creatureType: 8,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "6373": {
      entry: 6373,
      assetId: "classic-display-5087",
      displayId: 5087,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "6374": {
      entry: 6374,
      assetId: "classic-display-5092",
      displayId: 5092,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "6491": {
      entry: 6491,
      assetId: "classic-display-5233",
      displayId: 5233,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "6492": {
      entry: 6492,
      assetId: "classic-display-14273",
      displayId: 14273,
      creatureType: 4,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "6569": {
      entry: 6569,
      assetId: "classic-display-5377",
      displayId: 5377,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "6579": {
      entry: 6579,
      assetId: "classic-display-5378",
      displayId: 5378,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "6670": {
      entry: 6670,
      assetId: "classic-display-3264",
      displayId: 3264,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "6740": {
      entry: 6740,
      assetId: "classic-display-5444",
      displayId: 5444,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "6749": {
      entry: 6749,
      assetId: "classic-display-9257",
      displayId: 9257,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "6774": {
      entry: 6774,
      assetId: "classic-display-5526",
      displayId: 5526,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "6778": {
      entry: 6778,
      assetId: "classic-display-5527",
      displayId: 5527,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "6846": {
      entry: 6846,
      assetId: "classic-display-7849",
      displayId: 7849,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "6927": {
      entry: 6927,
      assetId: "classic-display-2357",
      displayId: 2357,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "6946": {
      entry: 6946,
      assetId: "classic-display-7613",
      displayId: 7613,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "7024": {
      entry: 7024,
      assetId: "classic-display-5783",
      displayId: 5783,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "7050": {
      entry: 7050,
      assetId: "classic-display-5812",
      displayId: 5812,
      creatureType: 6,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "7051": {
      entry: 7051,
      assetId: "classic-display-5813",
      displayId: 5813,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "7052": {
      entry: 7052,
      assetId: "classic-display-5811",
      displayId: 5811,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "7053": {
      entry: 7053,
      assetId: "classic-display-5805",
      displayId: 5805,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "7056": {
      entry: 7056,
      assetId: "classic-display-5806",
      displayId: 5806,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "7067": {
      entry: 7067,
      assetId: "classic-display-5832",
      displayId: 5832,
      creatureType: 6,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "7207": {
      entry: 7207,
      assetId: "classic-display-6446",
      displayId: 6446,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "7208": {
      entry: 7208,
      assetId: "classic-display-134",
      displayId: 134,
      creatureType: 8,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "7232": {
      entry: 7232,
      assetId: "classic-display-6007",
      displayId: 6007,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "7295": {
      entry: 7295,
      assetId: "classic-display-6061",
      displayId: 6061,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "7312": {
      entry: 7312,
      assetId: "classic-display-6072",
      displayId: 6072,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "7381": {
      entry: 7381,
      assetId: "classic-display-5555",
      displayId: 5555,
      creatureType: 1,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "7382": {
      entry: 7382,
      assetId: "classic-display-5554",
      displayId: 5554,
      creatureType: 1,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "7384": {
      entry: 7384,
      assetId: "classic-display-5586",
      displayId: 5586,
      creatureType: 1,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "7385": {
      entry: 7385,
      assetId: "classic-display-5556",
      displayId: 5556,
      creatureType: 1,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "7386": {
      entry: 7386,
      assetId: "classic-display-9989",
      displayId: 9989,
      creatureType: 1,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "7410": {
      entry: 7410,
      assetId: "classic-display-6198",
      displayId: 6198,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "7766": {
      entry: 7766,
      assetId: "classic-display-6632",
      displayId: 6632,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "7798": {
      entry: 7798,
      assetId: "classic-display-6844",
      displayId: 6844,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "7917": {
      entry: 7917,
      assetId: "classic-display-7008",
      displayId: 7008,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "8096": {
      entry: 8096,
      assetId: "classic-display-7308",
      displayId: 7308,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "8383": {
      entry: 8383,
      assetId: "classic-display-7673",
      displayId: 7673,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "8666": {
      entry: 8666,
      assetId: "classic-display-7935",
      displayId: 7935,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "8670": {
      entry: 8670,
      assetId: "classic-display-7991",
      displayId: 7991,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "8719": {
      entry: 8719,
      assetId: "classic-display-7992",
      displayId: 7992,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "8856": {
      entry: 8856,
      assetId: "classic-display-1159",
      displayId: 1159,
      creatureType: 9,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "8931": {
      entry: 8931,
      assetId: "classic-display-8185",
      displayId: 8185,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "8934": {
      entry: 8934,
      assetId: "classic-display-8186",
      displayId: 8186,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "9296": {
      entry: 9296,
      assetId: "classic-display-8489",
      displayId: 8489,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "9584": {
      entry: 9584,
      assetId: "classic-display-8809",
      displayId: 8809,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "9977": {
      entry: 9977,
      assetId: "classic-display-9249",
      displayId: 9249,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "10045": {
      entry: 10045,
      assetId: "classic-display-9265",
      displayId: 9265,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "10445": {
      entry: 10445,
      assetId: "classic-display-9810",
      displayId: 9810,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "10616": {
      entry: 10616,
      assetId: "classic-display-10995",
      displayId: 10995,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "10782": {
      entry: 10782,
      assetId: "classic-display-10131",
      displayId: 10131,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "11026": {
      entry: 11026,
      assetId: "classic-display-10569",
      displayId: 10569,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "11068": {
      entry: 11068,
      assetId: "classic-display-10591",
      displayId: 10591,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "11069": {
      entry: 11069,
      assetId: "classic-display-10477",
      displayId: 10477,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "11072": {
      entry: 11072,
      assetId: "classic-display-10610",
      displayId: 10610,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "11096": {
      entry: 11096,
      assetId: "classic-display-10625",
      displayId: 10625,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "11260": {
      entry: 11260,
      assetId: "classic-display-11354",
      displayId: 11354,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "11328": {
      entry: 11328,
      assetId: "classic-display-310",
      displayId: 310,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "11397": {
      entry: 11397,
      assetId: "classic-display-11044",
      displayId: 11044,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "11859": {
      entry: 11859,
      assetId: "classic-display-1912",
      displayId: 1912,
      creatureType: 3,
      family: 0,
      evidenceLevel: "pinned-local-model-id; Classic page unconfirmed"
    },
    "11867": {
      entry: 11867,
      assetId: "classic-display-11804",
      displayId: 11804,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "11916": {
      entry: 11916,
      assetId: "classic-display-1471",
      displayId: 1471,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "11940": {
      entry: 11940,
      assetId: "classic-display-11898",
      displayId: 11898,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "11979": {
      entry: 11979,
      assetId: "classic-display-11929",
      displayId: 11929,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "11994": {
      entry: 11994,
      assetId: "classic-display-11930",
      displayId: 11930,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "11996": {
      entry: 11996,
      assetId: "classic-display-257",
      displayId: 257,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "12123": {
      entry: 12123,
      assetId: "classic-display-12193",
      displayId: 12193,
      creatureType: 1,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "12336": {
      entry: 12336,
      assetId: "classic-display-13049",
      displayId: 13049,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "12375": {
      entry: 12375,
      assetId: "classic-display-2405",
      displayId: 2405,
      creatureType: 1,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "12376": {
      entry: 12376,
      assetId: "classic-display-2404",
      displayId: 2404,
      creatureType: 1,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "12423": {
      entry: 12423,
      assetId: "classic-display-3258",
      displayId: 3258,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "12480": {
      entry: 12480,
      assetId: "classic-display-5567",
      displayId: 5567,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "12481": {
      entry: 12481,
      assetId: "classic-display-5446",
      displayId: 5446,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "12805": {
      entry: 12805,
      assetId: "classic-display-12923",
      displayId: 12923,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "13159": {
      entry: 13159,
      assetId: "classic-display-13091",
      displayId: 13091,
      creatureType: 7,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "13283": {
      entry: 13283,
      assetId: "classic-display-13171",
      displayId: 13171,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "13435": {
      entry: 13435,
      assetId: "classic-display-13356",
      displayId: 13356,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "13436": {
      entry: 13436,
      assetId: "classic-display-13355",
      displayId: 13355,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "14273": {
      entry: 14273,
      assetId: "classic-display-5229",
      displayId: 5229,
      creatureType: 5,
      family: 0,
      evidenceLevel: "pinned-local-model-id; Classic page unconfirmed"
    },
    "14394": {
      entry: 14394,
      assetId: "classic-display-14431",
      displayId: 14431,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "14423": {
      entry: 14423,
      assetId: "classic-display-14472",
      displayId: 14472,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "14438": {
      entry: 14438,
      assetId: "classic-display-14492",
      displayId: 14492,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "14439": {
      entry: 14439,
      assetId: "classic-display-14493",
      displayId: 14493,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "14450": {
      entry: 14450,
      assetId: "classic-display-14500",
      displayId: 14500,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "14481": {
      entry: 14481,
      assetId: "classic-display-14529",
      displayId: 14529,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "14496": {
      entry: 14496,
      assetId: "classic-display-252",
      displayId: 252,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "14497": {
      entry: 14497,
      assetId: "classic-display-8632",
      displayId: 8632,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "14559": {
      entry: 14559,
      assetId: "classic-display-14582",
      displayId: 14582,
      creatureType: 1,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "14560": {
      entry: 14560,
      assetId: "classic-display-14338",
      displayId: 14338,
      creatureType: 1,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "14561": {
      entry: 14561,
      assetId: "classic-display-14583",
      displayId: 14583,
      creatureType: 1,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "14721": {
      entry: 14721,
      assetId: "classic-display-14733",
      displayId: 14733,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "14722": {
      entry: 14722,
      assetId: "classic-display-14753",
      displayId: 14753,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "14822": {
      entry: 14822,
      assetId: "classic-display-491",
      displayId: 491,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "14823": {
      entry: 14823,
      assetId: "classic-display-14855",
      displayId: 14855,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "14827": {
      entry: 14827,
      assetId: "classic-display-536",
      displayId: 536,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "14828": {
      entry: 14828,
      assetId: "classic-display-14854",
      displayId: 14854,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "14829": {
      entry: 14829,
      assetId: "classic-display-14856",
      displayId: 14856,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "14832": {
      entry: 14832,
      assetId: "classic-display-14876",
      displayId: 14876,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "14833": {
      entry: 14833,
      assetId: "classic-display-14875",
      displayId: 14875,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "14841": {
      entry: 14841,
      assetId: "classic-display-14877",
      displayId: 14877,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "14844": {
      entry: 14844,
      assetId: "classic-display-14880",
      displayId: 14880,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "14845": {
      entry: 14845,
      assetId: "classic-display-14881",
      displayId: 14881,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "14846": {
      entry: 14846,
      assetId: "classic-display-14882",
      displayId: 14882,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "14847": {
      entry: 14847,
      assetId: "classic-display-14883",
      displayId: 14883,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "14849": {
      entry: 14849,
      assetId: "classic-display-14890",
      displayId: 14890,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "14860": {
      entry: 14860,
      assetId: "classic-display-14589",
      displayId: 14589,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "14864": {
      entry: 14864,
      assetId: "classic-display-14939",
      displayId: 14939,
      creatureType: 1,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "14865": {
      entry: 14865,
      assetId: "classic-display-14935",
      displayId: 14935,
      creatureType: 1,
      family: 2,
      evidenceLevel: "local-creature-template-model-id"
    },
    "14866": {
      entry: 14866,
      assetId: "classic-display-14936",
      displayId: 14936,
      creatureType: 1,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "14868": {
      entry: 14868,
      assetId: "classic-display-14937",
      displayId: 14937,
      creatureType: 1,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "14869": {
      entry: 14869,
      assetId: "classic-display-14940",
      displayId: 14940,
      creatureType: 1,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "14871": {
      entry: 14871,
      assetId: "classic-display-14943",
      displayId: 14943,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "14981": {
      entry: 14981,
      assetId: "classic-display-15098",
      displayId: 15098,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "14991": {
      entry: 14991,
      assetId: "classic-display-15251",
      displayId: 15251,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "15008": {
      entry: 15008,
      assetId: "classic-display-15116",
      displayId: 15116,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "15102": {
      entry: 15102,
      assetId: "classic-display-15255",
      displayId: 15255,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "15103": {
      entry: 15103,
      assetId: "classic-display-15259",
      displayId: 15259,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "15218": {
      entry: 15218,
      assetId: "classic-display-11686",
      displayId: 11686,
      creatureType: 10,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "15303": {
      entry: 15303,
      assetId: "classic-display-15368",
      displayId: 15368,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "15310": {
      entry: 15310,
      assetId: "classic-display-338",
      displayId: 338,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "15351": {
      entry: 15351,
      assetId: "classic-display-15389",
      displayId: 15389,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "15384": {
      entry: 15384,
      assetId: "classic-display-11686",
      displayId: 11686,
      creatureType: 10,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "15562": {
      entry: 15562,
      assetId: "classic-display-15614",
      displayId: 15614,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "15565": {
      entry: 15565,
      assetId: "classic-display-15643",
      displayId: 15643,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "15577": {
      entry: 15577,
      assetId: "classic-display-15633",
      displayId: 15633,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "15659": {
      entry: 15659,
      assetId: "classic-display-15594",
      displayId: 15594,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "15708": {
      entry: 15708,
      assetId: "classic-display-15669",
      displayId: 15669,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "15730": {
      entry: 15730,
      assetId: "classic-display-15294",
      displayId: 15294,
      creatureType: 10,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "15732": {
      entry: 15732,
      assetId: "classic-display-13349",
      displayId: 13349,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "15760": {
      entry: 15760,
      assetId: "classic-display-15713",
      displayId: 15713,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "15766": {
      entry: 15766,
      assetId: "classic-display-15728",
      displayId: 15728,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "15892": {
      entry: 15892,
      assetId: "classic-display-15864",
      displayId: 15864,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "15893": {
      entry: 15893,
      assetId: "classic-display-15294",
      displayId: 15294,
      creatureType: 10,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "15894": {
      entry: 15894,
      assetId: "classic-display-15294",
      displayId: 15294,
      creatureType: 10,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "15895": {
      entry: 15895,
      assetId: "classic-display-15865",
      displayId: 15865,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "15897": {
      entry: 15897,
      assetId: "classic-display-15294",
      displayId: 15294,
      creatureType: 10,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "15898": {
      entry: 15898,
      assetId: "classic-display-15869",
      displayId: 15869,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "16002": {
      entry: 16002,
      assetId: "classic-display-15950",
      displayId: 15950,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "16005": {
      entry: 16005,
      assetId: "classic-display-15953",
      displayId: 15953,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "16075": {
      entry: 16075,
      assetId: "classic-display-15990",
      displayId: 15990,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "16105": {
      entry: 16105,
      assetId: "classic-display-16005",
      displayId: 16005,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "16106": {
      entry: 16106,
      assetId: "classic-display-16006",
      displayId: 16006,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "16241": {
      entry: 16241,
      assetId: "classic-display-16131",
      displayId: 16131,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "16285": {
      entry: 16285,
      assetId: "classic-display-16130",
      displayId: 16130,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "16395": {
      entry: 16395,
      assetId: "classic-display-16229",
      displayId: 16229,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "16422": {
      entry: 16422,
      assetId: "classic-display-12074",
      displayId: 12074,
      creatureType: 6,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "16423": {
      entry: 16423,
      assetId: "classic-display-16169",
      displayId: 16169,
      creatureType: 6,
      family: 0,
      evidenceLevel: "classic-npc-page-display-id"
    },
    "16433": {
      entry: 16433,
      assetId: "classic-display-16233",
      displayId: 16233,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "16434": {
      entry: 16434,
      assetId: "classic-display-16234",
      displayId: 16234,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "16478": {
      entry: 16478,
      assetId: "classic-display-16204",
      displayId: 16204,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "16781": {
      entry: 16781,
      assetId: "classic-display-16412",
      displayId: 16412,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "16786": {
      entry: 16786,
      assetId: "classic-display-16336",
      displayId: 16336,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "16788": {
      entry: 16788,
      assetId: "classic-display-16334",
      displayId: 16334,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "16817": {
      entry: 16817,
      assetId: "classic-display-16354",
      displayId: 16354,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "16995": {
      entry: 16995,
      assetId: "classic-display-11686",
      displayId: 11686,
      creatureType: 10,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "17038": {
      entry: 17038,
      assetId: "classic-display-16412",
      displayId: 16412,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "17066": {
      entry: 17066,
      assetId: "classic-display-13069",
      displayId: 13069,
      creatureType: 10,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    },
    "17804": {
      entry: 17804,
      assetId: "classic-display-17250",
      displayId: 17250,
      creatureType: 7,
      family: 0,
      evidenceLevel: "local-creature-template-model-id"
    }
  }
};

// ../../packages/game-data/data/creature-assets-manifest.json
var creature_assets_manifest_default = {
  schemaVersion: 1,
  retrievedAt: "2026-09-16",
  provenance: "Original Blizzard icon art served by Wowhead CDN, downloaded unchanged. Third-party reference mirror; not a historical client build archive.",
  copyright: "Blizzard Entertainment game assets. Repository source-code licenses do not relicense these files.",
  limitation: "All assets are generic species or creature-type icons. No exact NPC portraits, model textures, animation sequences or historical-build byte equivalence are claimed.",
  mappingSource: "Entry, ModelId1..4, Family and CreatureType from the pinned local classic-reference, quest-supplement-reference and deadmines-reference data.",
  assets: [
    {
      id: "unknown",
      icon: "inv_misc_questionmark",
      label: "\u672A\u77E5\u751F\u7269\u539F\u7248\u7C7B\u578B\u56FE\u6807",
      kind: "type-icon",
      path: "creatures/inv_misc_questionmark.jpg",
      url: "https://wow.zamimg.com/images/wow/icons/large/inv_misc_questionmark.jpg",
      sourcePage: "https://wow.zamimg.com/images/wow/icons/large/inv_misc_questionmark.jpg",
      sha256: "c2946592d85b6172ea3cf6714832fa867c3b253a06eb2e4ba6f57908863e44a0",
      bytes: 1369,
      transformation: "none"
    },
    {
      id: "beast",
      icon: "ability_tracking",
      label: "\u91CE\u517D\u539F\u7248\u7C7B\u578B\u56FE\u6807",
      kind: "type-icon",
      path: "creatures/ability_tracking.jpg",
      url: "https://wow.zamimg.com/images/wow/icons/large/ability_tracking.jpg",
      sourcePage: "https://www.wowhead.com/classic/spell=1494/track-beasts",
      sha256: "520287130b97a33d39eeb7d13e1e47076c923ca25df3864dcebc117db55645a3",
      bytes: 1670,
      transformation: "none"
    },
    {
      id: "humanoid",
      icon: "spell_holy_prayerofhealing",
      label: "\u4EBA\u578B\u751F\u7269\u539F\u7248\u7C7B\u578B\u56FE\u6807",
      kind: "type-icon",
      path: "creatures/spell_holy_prayerofhealing.jpg",
      url: "https://wow.zamimg.com/images/wow/icons/large/spell_holy_prayerofhealing.jpg",
      sourcePage: "https://www.wowhead.com/classic/spell=19883/track-humanoids",
      sha256: "a4839823cb22783f0392722841d28573d99d0675cac0768ce0416bc18ca0f81a",
      bytes: 2021,
      transformation: "none"
    },
    {
      id: "undead",
      icon: "spell_shadow_darksummoning",
      label: "\u4EA1\u7075\u539F\u7248\u7C7B\u578B\u56FE\u6807",
      kind: "type-icon",
      path: "creatures/spell_shadow_darksummoning.jpg",
      url: "https://wow.zamimg.com/images/wow/icons/large/spell_shadow_darksummoning.jpg",
      sourcePage: "https://www.wowhead.com/classic/spell=19884/track-undead",
      sha256: "8f6957d865be0a9c2179bad3e95359434f968d860178eabe42d4e13c9831f8ec",
      bytes: 2192,
      transformation: "none"
    },
    {
      id: "elemental",
      icon: "spell_frost_summonwaterelemental",
      label: "\u5143\u7D20\u751F\u7269\u539F\u7248\u7C7B\u578B\u56FE\u6807",
      kind: "type-icon",
      path: "creatures/spell_frost_summonwaterelemental.jpg",
      url: "https://wow.zamimg.com/images/wow/icons/large/spell_frost_summonwaterelemental.jpg",
      sourcePage: "https://www.wowhead.com/classic/spell=19880/track-elementals",
      sha256: "df0286ec18ea040d175190ef8b2da69d71bb749be7a60c223f813c0cc3fe35a1",
      bytes: 1919,
      transformation: "none"
    },
    {
      id: "mechanical",
      icon: "ability_repair",
      label: "\u673A\u68B0\u539F\u7248\u7C7B\u578B\u56FE\u6807",
      kind: "type-icon",
      path: "creatures/ability_repair.jpg",
      url: "https://wow.zamimg.com/images/wow/icons/large/ability_repair.jpg",
      sourcePage: "https://wow.zamimg.com/images/wow/icons/large/ability_repair.jpg",
      sha256: "709be770181fa917cdfa939ac022033af41515785da5e5c101a81ea26dbce464",
      bytes: 1632,
      transformation: "none"
    },
    {
      id: "wolf",
      icon: "ability_hunter_pet_wolf",
      label: "\u72FC\u539F\u7248\u7C7B\u578B\u56FE\u6807",
      kind: "species-icon",
      path: "creatures/ability_hunter_pet_wolf.jpg",
      url: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_pet_wolf.jpg",
      sourcePage: "https://www.wowhead.com/classic/pet=1/wolf",
      sha256: "f7653738bed4c61c5c068190bbf08baba4fee1d61faa92de82ce03eb5e5da43a",
      bytes: 1688,
      transformation: "none"
    },
    {
      id: "spider",
      icon: "ability_hunter_pet_spider",
      label: "\u8718\u86DB\u539F\u7248\u7C7B\u578B\u56FE\u6807",
      kind: "species-icon",
      path: "creatures/ability_hunter_pet_spider.jpg",
      url: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_pet_spider.jpg",
      sourcePage: "https://www.wowhead.com/classic/pet=3/spider",
      sha256: "297a49555132a5e621b5ed6de3884243f80798b6c60fbffeab14c171f0038632",
      bytes: 1828,
      transformation: "none"
    },
    {
      id: "bear",
      icon: "ability_hunter_pet_bear",
      label: "\u718A\u539F\u7248\u7C7B\u578B\u56FE\u6807",
      kind: "species-icon",
      path: "creatures/ability_hunter_pet_bear.jpg",
      url: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_pet_bear.jpg",
      sourcePage: "https://www.wowhead.com/classic/pet=4/bear",
      sha256: "6ebc67b2b5616f4e13fb01c2b9bdc505c9b7b45c5e54b834424362110be1a814",
      bytes: 1900,
      transformation: "none"
    },
    {
      id: "boar",
      icon: "ability_hunter_pet_boar",
      label: "\u91CE\u732A\u539F\u7248\u7C7B\u578B\u56FE\u6807",
      kind: "species-icon",
      path: "creatures/ability_hunter_pet_boar.jpg",
      url: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_pet_boar.jpg",
      sourcePage: "https://www.wowhead.com/classic/pet=5/boar",
      sha256: "c6cf53bc41bcf78ca73b51edf06423f5d41ebd99b56325fc92d1b3d23d9d0c70",
      bytes: 1781,
      transformation: "none"
    },
    {
      id: "vulture",
      icon: "ability_hunter_pet_vulture",
      label: "\u98DF\u8150\u9E1F\u539F\u7248\u7C7B\u578B\u56FE\u6807",
      kind: "species-icon",
      path: "creatures/ability_hunter_pet_vulture.jpg",
      url: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_pet_vulture.jpg",
      sourcePage: "https://www.wowhead.com/classic/pet=7/carrion-bird",
      sha256: "fec4f153006fde63bd6a190bb1f6bb57a2ca253ec12e4cf97e9b305ddd1276b4",
      bytes: 1746,
      transformation: "none"
    },
    {
      id: "crab",
      icon: "ability_hunter_pet_crab",
      label: "\u8783\u87F9\u539F\u7248\u7C7B\u578B\u56FE\u6807",
      kind: "species-icon",
      path: "creatures/ability_hunter_pet_crab.jpg",
      url: "https://wow.zamimg.com/images/wow/icons/large/ability_hunter_pet_crab.jpg",
      sourcePage: "https://www.wowhead.com/classic/pet=8/crab",
      sha256: "b2381fc1c74bb4333dc3b0704d2bec038050b1e0e02931bb25a3c2c14ed7a4f2",
      bytes: 1978,
      transformation: "none"
    }
  ],
  entries: {
    "3": {
      assetId: "undead",
      models: [
        987
      ],
      family: 0,
      creatureType: 6
    },
    "6": {
      assetId: "humanoid",
      models: [
        10913
      ],
      family: 0,
      creatureType: 7
    },
    "30": {
      assetId: "spider",
      models: [
        382
      ],
      family: 3,
      creatureType: 1
    },
    "36": {
      assetId: "mechanical",
      models: [
        367
      ],
      family: 0,
      creatureType: 9
    },
    "38": {
      assetId: "humanoid",
      models: [
        5035,
        5036
      ],
      family: 0,
      creatureType: 7
    },
    "40": {
      assetId: "humanoid",
      models: [
        373
      ],
      family: 0,
      creatureType: 7
    },
    "43": {
      assetId: "spider",
      models: [
        368
      ],
      family: 3,
      creatureType: 1
    },
    "46": {
      assetId: "humanoid",
      models: [
        441
      ],
      family: 0,
      creatureType: 7
    },
    "60": {
      assetId: "humanoid",
      models: [
        2153
      ],
      family: 0,
      creatureType: 7
    },
    "61": {
      assetId: "humanoid",
      models: [
        3341
      ],
      family: 0,
      creatureType: 7
    },
    "69": {
      assetId: "wolf",
      models: [
        604
      ],
      family: 1,
      creatureType: 1
    },
    "79": {
      assetId: "humanoid",
      models: [
        774
      ],
      family: 0,
      creatureType: 7
    },
    "80": {
      assetId: "humanoid",
      models: [
        365
      ],
      family: 0,
      creatureType: 7
    },
    "94": {
      assetId: "humanoid",
      models: [
        2361,
        2362
      ],
      family: 0,
      creatureType: 7
    },
    "95": {
      assetId: "humanoid",
      models: [
        4418,
        4419
      ],
      family: 0,
      creatureType: 7
    },
    "97": {
      assetId: "humanoid",
      models: [
        10791
      ],
      family: 0,
      creatureType: 7
    },
    "98": {
      assetId: "humanoid",
      models: [
        376
      ],
      family: 0,
      creatureType: 7
    },
    "99": {
      assetId: "humanoid",
      models: [
        3320
      ],
      family: 0,
      creatureType: 7
    },
    "100": {
      assetId: "humanoid",
      models: [
        175
      ],
      family: 0,
      creatureType: 7
    },
    "103": {
      assetId: "humanoid",
      models: [
        2073
      ],
      family: 0,
      creatureType: 7
    },
    "113": {
      assetId: "boar",
      models: [
        503
      ],
      family: 5,
      creatureType: 1
    },
    "114": {
      assetId: "mechanical",
      models: [
        378
      ],
      family: 0,
      creatureType: 9
    },
    "115": {
      assetId: "mechanical",
      models: [
        379
      ],
      family: 0,
      creatureType: 9
    },
    "116": {
      assetId: "humanoid",
      models: [
        2357,
        2358
      ],
      family: 0,
      creatureType: 7
    },
    "117": {
      assetId: "humanoid",
      models: [
        175
      ],
      family: 0,
      creatureType: 7
    },
    "118": {
      assetId: "wolf",
      models: [
        11415
      ],
      family: 1,
      creatureType: 1
    },
    "119": {
      assetId: "boar",
      models: [
        381
      ],
      family: 5,
      creatureType: 1
    },
    "121": {
      assetId: "humanoid",
      models: [
        2336,
        2337
      ],
      family: 0,
      creatureType: 7
    },
    "122": {
      assetId: "humanoid",
      models: [
        2342,
        2343
      ],
      family: 0,
      creatureType: 7
    },
    "123": {
      assetId: "humanoid",
      models: [
        383
      ],
      family: 0,
      creatureType: 7
    },
    "124": {
      assetId: "humanoid",
      models: [
        384
      ],
      family: 0,
      creatureType: 7
    },
    "125": {
      assetId: "humanoid",
      models: [
        10790
      ],
      family: 0,
      creatureType: 7
    },
    "126": {
      assetId: "humanoid",
      models: [
        983
      ],
      family: 0,
      creatureType: 7
    },
    "127": {
      assetId: "humanoid",
      models: [
        1995
      ],
      family: 0,
      creatureType: 7
    },
    "154": {
      assetId: "vulture",
      models: [
        1105
      ],
      family: 7,
      creatureType: 1
    },
    "157": {
      assetId: "boar",
      models: [
        3027
      ],
      family: 5,
      creatureType: 1
    },
    "171": {
      assetId: "humanoid",
      models: [
        1305
      ],
      family: 0,
      creatureType: 7
    },
    "199": {
      assetId: "vulture",
      models: [
        410
      ],
      family: 7,
      creatureType: 1
    },
    "202": {
      assetId: "undead",
      models: [
        9786
      ],
      family: 0,
      creatureType: 6
    },
    "213": {
      assetId: "wolf",
      models: [
        801
      ],
      family: 1,
      creatureType: 1
    },
    "215": {
      assetId: "humanoid",
      models: [
        4276,
        4278
      ],
      family: 0,
      creatureType: 7
    },
    "217": {
      assetId: "spider",
      models: [
        955
      ],
      family: 3,
      creatureType: 1
    },
    "218": {
      assetId: "humanoid",
      models: [
        4275,
        4277
      ],
      family: 0,
      creatureType: 7
    },
    "257": {
      assetId: "humanoid",
      models: [
        10912
      ],
      family: 0,
      creatureType: 7
    },
    "285": {
      assetId: "humanoid",
      models: [
        617
      ],
      family: 0,
      creatureType: 7
    },
    "299": {
      assetId: "wolf",
      models: [
        447
      ],
      family: 1,
      creatureType: 1
    },
    "327": {
      assetId: "humanoid",
      models: [
        2299
      ],
      family: 0,
      creatureType: 7
    },
    "330": {
      assetId: "boar",
      models: [
        8871
      ],
      family: 5,
      creatureType: 1
    },
    "390": {
      assetId: "boar",
      models: [
        377
      ],
      family: 5,
      creatureType: 1
    },
    "391": {
      assetId: "humanoid",
      models: [
        5243
      ],
      family: 0,
      creatureType: 7
    },
    "448": {
      assetId: "humanoid",
      models: [
        384
      ],
      family: 0,
      creatureType: 7
    },
    "449": {
      assetId: "humanoid",
      models: [
        2344,
        2345
      ],
      family: 0,
      creatureType: 7
    },
    "450": {
      assetId: "humanoid",
      models: [
        4420,
        4421
      ],
      family: 0,
      creatureType: 7
    },
    "452": {
      assetId: "humanoid",
      models: [
        383
      ],
      family: 0,
      creatureType: 7
    },
    "453": {
      assetId: "humanoid",
      models: [
        502
      ],
      family: 0,
      creatureType: 7
    },
    "454": {
      assetId: "boar",
      models: [
        8871
      ],
      family: 5,
      creatureType: 1
    },
    "456": {
      assetId: "humanoid",
      models: [
        486
      ],
      family: 0,
      creatureType: 7
    },
    "458": {
      assetId: "humanoid",
      models: [
        757
      ],
      family: 0,
      creatureType: 7
    },
    "471": {
      assetId: "spider",
      models: [
        2541
      ],
      family: 3,
      creatureType: 1
    },
    "472": {
      assetId: "humanoid",
      models: [
        175
      ],
      family: 0,
      creatureType: 7
    },
    "473": {
      assetId: "humanoid",
      models: [
        2074
      ],
      family: 0,
      creatureType: 7
    },
    "474": {
      assetId: "humanoid",
      models: [
        2359,
        2360
      ],
      family: 0,
      creatureType: 7
    },
    "475": {
      assetId: "humanoid",
      models: [
        139
      ],
      family: 0,
      creatureType: 7
    },
    "476": {
      assetId: "humanoid",
      models: [
        163
      ],
      family: 0,
      creatureType: 7
    },
    "478": {
      assetId: "humanoid",
      models: [
        512
      ],
      family: 0,
      creatureType: 7
    },
    "480": {
      assetId: "mechanical",
      models: [
        514
      ],
      family: 0,
      creatureType: 9
    },
    "481": {
      assetId: "humanoid",
      models: [
        2333,
        2335
      ],
      family: 0,
      creatureType: 7
    },
    "500": {
      assetId: "humanoid",
      models: [
        374
      ],
      family: 0,
      creatureType: 7
    },
    "501": {
      assetId: "humanoid",
      models: [
        413
      ],
      family: 0,
      creatureType: 7
    },
    "502": {
      assetId: "humanoid",
      models: [
        4422
      ],
      family: 0,
      creatureType: 7
    },
    "504": {
      assetId: "humanoid",
      models: [
        2331,
        2332
      ],
      family: 0,
      creatureType: 7
    },
    "506": {
      assetId: "humanoid",
      models: [
        383
      ],
      family: 0,
      creatureType: 7
    },
    "513": {
      assetId: "humanoid",
      models: [
        1994
      ],
      family: 0,
      creatureType: 7
    },
    "517": {
      assetId: "humanoid",
      models: [
        1079
      ],
      family: 0,
      creatureType: 7
    },
    "520": {
      assetId: "humanoid",
      models: [
        652
      ],
      family: 0,
      creatureType: 7
    },
    "521": {
      assetId: "wolf",
      models: [
        11412
      ],
      family: 1,
      creatureType: 1
    },
    "524": {
      assetId: "boar",
      models: [
        389
      ],
      family: 5,
      creatureType: 1
    },
    "525": {
      assetId: "wolf",
      models: [
        903
      ],
      family: 1,
      creatureType: 1
    },
    "531": {
      assetId: "undead",
      models: [
        7550
      ],
      family: 0,
      creatureType: 6
    },
    "539": {
      assetId: "spider",
      models: [
        958
      ],
      family: 3,
      creatureType: 1
    },
    "547": {
      assetId: "boar",
      models: [
        3035
      ],
      family: 5,
      creatureType: 1
    },
    "550": {
      assetId: "humanoid",
      models: [
        2312
      ],
      family: 0,
      creatureType: 7
    },
    "565": {
      assetId: "wolf",
      models: [
        802
      ],
      family: 1,
      creatureType: 1
    },
    "569": {
      assetId: "spider",
      models: [
        2541
      ],
      family: 3,
      creatureType: 1
    },
    "572": {
      assetId: "undead",
      models: [
        1065
      ],
      family: 0,
      creatureType: 6
    },
    "573": {
      assetId: "mechanical",
      models: [
        548
      ],
      family: 0,
      creatureType: 9
    },
    "589": {
      assetId: "humanoid",
      models: [
        2338,
        2339
      ],
      family: 0,
      creatureType: 7
    },
    "590": {
      assetId: "humanoid",
      models: [
        2340,
        2341
      ],
      family: 0,
      creatureType: 7
    },
    "594": {
      assetId: "humanoid",
      models: [
        2323,
        2324
      ],
      family: 0,
      creatureType: 7
    },
    "596": {
      assetId: "humanoid",
      models: [
        3267
      ],
      family: 0,
      creatureType: 7
    },
    "598": {
      assetId: "humanoid",
      models: [
        308,
        2444
      ],
      family: 0,
      creatureType: 7
    },
    "599": {
      assetId: "humanoid",
      models: [
        2355
      ],
      family: 0,
      creatureType: 7
    },
    "619": {
      assetId: "humanoid",
      models: [
        2329,
        2330
      ],
      family: 0,
      creatureType: 7
    },
    "622": {
      assetId: "humanoid",
      models: [
        7109
      ],
      family: 0,
      creatureType: 7
    },
    "623": {
      assetId: "undead",
      models: [
        11402
      ],
      family: 0,
      creatureType: 6
    },
    "624": {
      assetId: "undead",
      models: [
        10630
      ],
      family: 0,
      creatureType: 6
    },
    "625": {
      assetId: "undead",
      models: [
        829
      ],
      family: 0,
      creatureType: 6
    },
    "626": {
      assetId: "undead",
      models: [
        10628
      ],
      family: 0,
      creatureType: 6
    },
    "628": {
      assetId: "wolf",
      models: [
        741
      ],
      family: 1,
      creatureType: 1
    },
    "634": {
      assetId: "humanoid",
      models: [
        2316,
        2317
      ],
      family: 0,
      creatureType: 7
    },
    "636": {
      assetId: "humanoid",
      models: [
        2314,
        2315
      ],
      family: 0,
      creatureType: 7
    },
    "639": {
      assetId: "humanoid",
      models: [
        2029
      ],
      family: 0,
      creatureType: 7
    },
    "641": {
      assetId: "humanoid",
      models: [
        7111
      ],
      family: 0,
      creatureType: 7
    },
    "642": {
      assetId: "mechanical",
      models: [
        1269
      ],
      family: 0,
      creatureType: 9
    },
    "643": {
      assetId: "humanoid",
      models: [
        7125
      ],
      family: 0,
      creatureType: 7
    },
    "644": {
      assetId: "humanoid",
      models: [
        14403
      ],
      family: 0,
      creatureType: 7
    },
    "645": {
      assetId: "humanoid",
      models: [
        1305
      ],
      family: 0,
      creatureType: 7
    },
    "646": {
      assetId: "humanoid",
      models: [
        2026
      ],
      family: 0,
      creatureType: 7
    },
    "647": {
      assetId: "humanoid",
      models: [
        7113
      ],
      family: 0,
      creatureType: 7
    },
    "657": {
      assetId: "humanoid",
      models: [
        2347,
        2348
      ],
      family: 0,
      creatureType: 7
    },
    "732": {
      assetId: "humanoid",
      models: [
        983
      ],
      family: 0,
      creatureType: 7
    },
    "735": {
      assetId: "humanoid",
      models: [
        527
      ],
      family: 0,
      creatureType: 7
    },
    "822": {
      assetId: "bear",
      models: [
        1006
      ],
      family: 4,
      creatureType: 1
    },
    "824": {
      assetId: "humanoid",
      models: [
        2441,
        556
      ],
      family: 0,
      creatureType: 7
    },
    "831": {
      assetId: "crab",
      models: [
        979
      ],
      family: 8,
      creatureType: 1
    },
    "832": {
      assetId: "elemental",
      models: [
        5327
      ],
      family: 0,
      creatureType: 4
    },
    "833": {
      assetId: "wolf",
      models: [
        161
      ],
      family: 1,
      creatureType: 1
    },
    "834": {
      assetId: "wolf",
      models: [
        643
      ],
      family: 1,
      creatureType: 1
    },
    "846": {
      assetId: "undead",
      models: [
        646
      ],
      family: 0,
      creatureType: 6
    },
    "880": {
      assetId: "humanoid",
      models: [
        3322
      ],
      family: 0,
      creatureType: 7
    },
    "881": {
      assetId: "humanoid",
      models: [
        3321
      ],
      family: 0,
      creatureType: 7
    },
    "909": {
      assetId: "humanoid",
      models: [
        4279,
        4280
      ],
      family: 0,
      creatureType: 7
    },
    "923": {
      assetId: "wolf",
      models: [
        246
      ],
      family: 1,
      creatureType: 1
    },
    "930": {
      assetId: "spider",
      models: [
        368
      ],
      family: 3,
      creatureType: 1
    },
    "948": {
      assetId: "undead",
      models: [
        137
      ],
      family: 0,
      creatureType: 6
    },
    "949": {
      assetId: "spider",
      models: [
        545
      ],
      family: 3,
      creatureType: 1
    },
    "1065": {
      assetId: "humanoid",
      models: [
        204
      ],
      family: 0,
      creatureType: 7
    },
    "1109": {
      assetId: "vulture",
      models: [
        2305
      ],
      family: 7,
      creatureType: 1
    },
    "1216": {
      assetId: "crab",
      models: [
        9570
      ],
      family: 8,
      creatureType: 1
    },
    "1236": {
      assetId: "humanoid",
      models: [
        373
      ],
      family: 0,
      creatureType: 7
    },
    "1424": {
      assetId: "humanoid",
      models: [
        774
      ],
      family: 0,
      creatureType: 7
    },
    "1426": {
      assetId: "humanoid",
      models: [
        374
      ],
      family: 0,
      creatureType: 7
    },
    "1725": {
      assetId: "humanoid",
      models: [
        184
      ],
      family: 0,
      creatureType: 7
    },
    "1726": {
      assetId: "humanoid",
      models: [
        2321,
        2322
      ],
      family: 0,
      creatureType: 7
    },
    "1727": {
      assetId: "humanoid",
      models: [
        341,
        2528
      ],
      family: 0,
      creatureType: 7
    },
    "1729": {
      assetId: "humanoid",
      models: [
        2318,
        2319
      ],
      family: 0,
      creatureType: 7
    },
    "1731": {
      assetId: "humanoid",
      models: [
        7110
      ],
      family: 0,
      creatureType: 7
    },
    "1732": {
      assetId: "humanoid",
      models: [
        2349,
        2350
      ],
      family: 0,
      creatureType: 7
    },
    "1763": {
      assetId: "humanoid",
      models: [
        7124
      ],
      family: 0,
      creatureType: 7
    },
    "1922": {
      assetId: "wolf",
      models: [
        380
      ],
      family: 1,
      creatureType: 1
    },
    "3586": {
      assetId: "humanoid",
      models: [
        556
      ],
      family: 0,
      creatureType: 7
    },
    "3947": {
      assetId: "humanoid",
      models: [
        7112
      ],
      family: 0,
      creatureType: 7
    },
    "4416": {
      assetId: "humanoid",
      models: [
        2438,
        341
      ],
      family: 0,
      creatureType: 7
    },
    "4417": {
      assetId: "humanoid",
      models: [
        2440,
        2443
      ],
      family: 0,
      creatureType: 7
    },
    "4418": {
      assetId: "humanoid",
      models: [
        2447,
        2448
      ],
      family: 0,
      creatureType: 7
    },
    "5043": {
      assetId: "humanoid",
      models: [
        2148,
        2145,
        2146,
        2147
      ],
      family: 0,
      creatureType: 7
    },
    "6093": {
      assetId: "humanoid",
      models: [
        4947
      ],
      family: 0,
      creatureType: 7
    },
    "6846": {
      assetId: "humanoid",
      models: [
        7849
      ],
      family: 0,
      creatureType: 7
    },
    "6927": {
      assetId: "humanoid",
      models: [
        2357,
        2358
      ],
      family: 0,
      creatureType: 7
    },
    "7050": {
      assetId: "undead",
      models: [
        5812
      ],
      family: 0,
      creatureType: 6
    },
    "7051": {
      assetId: "humanoid",
      models: [
        5813
      ],
      family: 0,
      creatureType: 7
    },
    "7052": {
      assetId: "humanoid",
      models: [
        5811,
        5809
      ],
      family: 0,
      creatureType: 7
    },
    "7053": {
      assetId: "humanoid",
      models: [
        5805
      ],
      family: 0,
      creatureType: 7
    },
    "7056": {
      assetId: "humanoid",
      models: [
        5806,
        5807
      ],
      family: 0,
      creatureType: 7
    },
    "7067": {
      assetId: "undead",
      models: [
        5832
      ],
      family: 0,
      creatureType: 6
    },
    "12123": {
      assetId: "beast",
      models: [
        12193,
        12194,
        12195,
        12196
      ],
      family: 0,
      creatureType: 1
    },
    "13159": {
      assetId: "humanoid",
      models: [
        13091
      ],
      family: 0,
      creatureType: 7
    },
    "16422": {
      assetId: "undead",
      models: [
        12074
      ],
      family: 0,
      creatureType: 6
    },
    "16423": {
      assetId: "undead",
      models: [
        16169
      ],
      family: 0,
      creatureType: 6
    }
  },
  models: {
    "137": "undead",
    "139": "humanoid",
    "161": "wolf",
    "163": "humanoid",
    "175": "humanoid",
    "184": "humanoid",
    "204": "humanoid",
    "246": "wolf",
    "308": "humanoid",
    "341": "humanoid",
    "365": "humanoid",
    "367": "mechanical",
    "368": "spider",
    "373": "humanoid",
    "374": "humanoid",
    "376": "humanoid",
    "377": "boar",
    "378": "mechanical",
    "379": "mechanical",
    "380": "wolf",
    "381": "boar",
    "382": "spider",
    "383": "humanoid",
    "384": "humanoid",
    "389": "boar",
    "410": "vulture",
    "413": "humanoid",
    "441": "humanoid",
    "447": "wolf",
    "486": "humanoid",
    "502": "humanoid",
    "503": "boar",
    "512": "humanoid",
    "514": "mechanical",
    "527": "humanoid",
    "545": "spider",
    "548": "mechanical",
    "556": "humanoid",
    "604": "wolf",
    "617": "humanoid",
    "643": "wolf",
    "646": "undead",
    "652": "humanoid",
    "741": "wolf",
    "757": "humanoid",
    "774": "humanoid",
    "801": "wolf",
    "802": "wolf",
    "829": "undead",
    "903": "wolf",
    "955": "spider",
    "958": "spider",
    "979": "crab",
    "983": "humanoid",
    "987": "undead",
    "1006": "bear",
    "1065": "undead",
    "1079": "humanoid",
    "1105": "vulture",
    "1269": "mechanical",
    "1305": "humanoid",
    "1994": "humanoid",
    "1995": "humanoid",
    "2026": "humanoid",
    "2029": "humanoid",
    "2073": "humanoid",
    "2074": "humanoid",
    "2145": "humanoid",
    "2146": "humanoid",
    "2147": "humanoid",
    "2148": "humanoid",
    "2153": "humanoid",
    "2299": "humanoid",
    "2305": "vulture",
    "2312": "humanoid",
    "2314": "humanoid",
    "2315": "humanoid",
    "2316": "humanoid",
    "2317": "humanoid",
    "2318": "humanoid",
    "2319": "humanoid",
    "2321": "humanoid",
    "2322": "humanoid",
    "2323": "humanoid",
    "2324": "humanoid",
    "2329": "humanoid",
    "2330": "humanoid",
    "2331": "humanoid",
    "2332": "humanoid",
    "2333": "humanoid",
    "2335": "humanoid",
    "2336": "humanoid",
    "2337": "humanoid",
    "2338": "humanoid",
    "2339": "humanoid",
    "2340": "humanoid",
    "2341": "humanoid",
    "2342": "humanoid",
    "2343": "humanoid",
    "2344": "humanoid",
    "2345": "humanoid",
    "2347": "humanoid",
    "2348": "humanoid",
    "2349": "humanoid",
    "2350": "humanoid",
    "2355": "humanoid",
    "2357": "humanoid",
    "2358": "humanoid",
    "2359": "humanoid",
    "2360": "humanoid",
    "2361": "humanoid",
    "2362": "humanoid",
    "2438": "humanoid",
    "2440": "humanoid",
    "2441": "humanoid",
    "2443": "humanoid",
    "2444": "humanoid",
    "2447": "humanoid",
    "2448": "humanoid",
    "2528": "humanoid",
    "2541": "spider",
    "3027": "boar",
    "3035": "boar",
    "3267": "humanoid",
    "3320": "humanoid",
    "3321": "humanoid",
    "3322": "humanoid",
    "3341": "humanoid",
    "4275": "humanoid",
    "4276": "humanoid",
    "4277": "humanoid",
    "4278": "humanoid",
    "4279": "humanoid",
    "4280": "humanoid",
    "4418": "humanoid",
    "4419": "humanoid",
    "4420": "humanoid",
    "4421": "humanoid",
    "4422": "humanoid",
    "4947": "humanoid",
    "5035": "humanoid",
    "5036": "humanoid",
    "5243": "humanoid",
    "5327": "elemental",
    "5805": "humanoid",
    "5806": "humanoid",
    "5807": "humanoid",
    "5809": "humanoid",
    "5811": "humanoid",
    "5812": "undead",
    "5813": "humanoid",
    "5832": "undead",
    "7109": "humanoid",
    "7110": "humanoid",
    "7111": "humanoid",
    "7112": "humanoid",
    "7113": "humanoid",
    "7124": "humanoid",
    "7125": "humanoid",
    "7550": "undead",
    "7849": "humanoid",
    "8871": "boar",
    "9570": "crab",
    "9786": "undead",
    "10628": "undead",
    "10630": "undead",
    "10790": "humanoid",
    "10791": "humanoid",
    "10912": "humanoid",
    "10913": "humanoid",
    "11402": "undead",
    "11412": "wolf",
    "11415": "wolf",
    "12074": "undead",
    "12193": "beast",
    "12194": "beast",
    "12195": "beast",
    "12196": "beast",
    "13091": "humanoid",
    "14403": "humanoid",
    "16169": "undead"
  },
  families: {
    "1": "wolf",
    "3": "spider",
    "4": "bear",
    "5": "boar",
    "7": "vulture",
    "8": "crab"
  },
  types: {
    "0": "unknown",
    "1": "beast",
    "4": "elemental",
    "6": "undead",
    "7": "humanoid",
    "9": "mechanical"
  }
};

// ../../packages/game-data/creature-visuals.js
var assets = new Map(npc_models_manifest_default.assets.map((asset) => [asset.id, asset]));
var models = new Map(npc_models_manifest_default.assets.map((asset) => [asset.displayId, asset]));
var types = { 1: "\u91CE\u517D", 2: "\u9F99\u7C7B", 3: "\u6076\u9B54", 4: "\u5143\u7D20\u751F\u7269", 5: "\u5DE8\u4EBA", 6: "\u4EA1\u7075", 7: "\u4EBA\u578B\u751F\u7269", 8: "\u5C0F\u52A8\u7269", 9: "\u673A\u68B0" };
var serviceModels = { bank: 332, auction: 8670, shop: 54, inn: 6740, trainer: 197, professions: 78, flight: 352, tram: 914, quests: 68 };
function creatureVisual(unit) {
  const record = npc_models_manifest_default.entries[unit?.entry];
  const asset = assets.get(record?.assetId) || models.get(unit?.modelId ?? unit?.ModelId1);
  const creatureType = record?.creatureType ?? unit?.creatureType ?? unit?.CreatureType;
  return {
    src: asset ? "/" + asset.path : null,
    kind: asset ? "npc-model-render" : "missing-model",
    label: asset ? `${types[creatureType] || "\u751F\u7269"} \xB7 2D \u6A21\u578B\u8D34\u56FE` : "\u6A21\u578B\u8D34\u56FE\u6682\u7F3A",
    species: creature_assets_manifest_default.entries[unit?.entry]?.assetId || creature_assets_manifest_default.models[unit?.modelId ?? unit?.ModelId1],
    creatureType
  };
}

// app/creature-portrait.tsx
import { jsx as jsx10 } from "react/jsx-runtime";
function CreaturePortrait({ unit, className = "" }) {
  const visual = creatureVisual(unit), [failed, setFailed] = useState5(null);
  return /* @__PURE__ */ jsx10("span", { className: `creature-portrait ${className}`, "aria-hidden": "true", children: visual.src && failed !== visual.src ? /* @__PURE__ */ jsx10("img", { src: visual.src, alt: "", loading: "lazy", decoding: "async", onError: () => setFailed(visual.src) }) : /* @__PURE__ */ jsx10("span", { className: "missing-creature-model", children: "\u8D34\u56FE\u6682\u7F3A" }) });
}

// app/local-npcs.tsx
import { Fragment as Fragment3, jsx as jsx11, jsxs as jsxs9 } from "react/jsx-runtime";
var names = { quests: "\u4EFB\u52A1", trainer: "\u804C\u4E1A\u8BAD\u7EC3", shop: "\u4EA4\u6613", inn: "\u65C5\u5E97" };
function NpcPortrait({ npc }) {
  if (npc.entry || npc.key === "class-trainer") return /* @__PURE__ */ jsx11(CreaturePortrait, { unit: { entry: npc.entry || serviceModels.trainer }, className: "npc-portrait" });
  const Glyph = npc.roles.includes("quests") ? ScrollText : npc.roles.includes("trainer") ? BookOpen : npc.roles.includes("inn") ? BedDouble : npc.roles.includes("shop") ? Store : UserRound;
  return /* @__PURE__ */ jsx11("span", { className: "npc-portrait", "aria-hidden": "true", children: /* @__PURE__ */ jsx11(Glyph, { size: 30 }) });
}
function QuestConversation({ quest: q, ...props }) {
  const { data: d, busy, send } = props, [choice, setChoice] = useState6(0);
  const canChoose = !q.canAccept && q.complete;
  const selectedChoice = q.choices.some((i) => i.id === choice) ? choice : 0;
  return /* @__PURE__ */ jsxs9("article", { className: "npc-quest", children: [
    /* @__PURE__ */ jsxs9("h3", { children: [
      q.name,
      " ",
      /* @__PURE__ */ jsxs9("small", { children: [
        "\u7B49\u7EA7 ",
        q.level
      ] })
    ] }),
    /* @__PURE__ */ jsx11("p", { children: q.description }),
    /* @__PURE__ */ jsx11("div", { className: "objective-list", children: q.objectives.map((o, i) => /* @__PURE__ */ jsx11("div", { children: /* @__PURE__ */ jsxs9("span", { className: o.count >= o.required ? "done" : "", children: [
      o.name,
      " ",
      /* @__PURE__ */ jsxs9("b", { children: [
        o.count,
        "/",
        o.required
      ] })
    ] }) }, i)) }),
    /* @__PURE__ */ jsxs9("p", { className: "reward-line", children: [
      "\u5956\u52B1\uFF1A",
      q.xp,
      " \u7ECF\u9A8C",
      q.money > 0 ? " \xB7 " + money(q.money) : ""
    ] }),
    q.rewards.map((i) => /* @__PURE__ */ jsx11(Item, { item: d.items[i.id], instance: i }, i.id)),
    q.choices.length > 0 && /* @__PURE__ */ jsxs9("section", { "aria-label": "\u53EF\u9009\u5956\u52B1", children: [
      /* @__PURE__ */ jsx11("p", { className: "reward-line", children: "\u53EF\u9009\u5956\u52B1\uFF08\u5B8C\u6210\u4EFB\u52A1\u65F6\u4ECE\u4EE5\u4E0B\u7269\u54C1\u4E2D\u9009\u62E9\u4E00\u4EF6\uFF09\uFF1A" }),
      q.choices.map((i) => /* @__PURE__ */ jsx11(Item, { item: d.items[i.id], instance: i }, i.id)),
      canChoose && /* @__PURE__ */ jsxs9("label", { className: "reward-choice", children: [
        "\u9009\u62E9\u5956\u52B1",
        /* @__PURE__ */ jsxs9("select", { disabled: busy, value: selectedChoice || "", onChange: (e) => setChoice(Number(e.target.value)), children: [
          /* @__PURE__ */ jsx11("option", { value: "", children: "\u8BF7\u9009\u62E9" }),
          q.choices.map((i) => /* @__PURE__ */ jsx11("option", { value: i.id, children: d.items[i.id]?.name || i.id }, i.id))
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx11("div", { className: "action-row", children: q.canAccept ? /* @__PURE__ */ jsx11(Button, { disabled: busy, onClick: () => send({ type: "accept", id: q.id }), children: "\u63A5\u53D7\u4EFB\u52A1" }) : /* @__PURE__ */ jsx11(Button, { disabled: busy || !q.complete || q.choices.length > 0 && !selectedChoice, onClick: () => send({ type: "turnin", id: q.id, choice: selectedChoice }), children: q.complete ? "\u5B8C\u6210\u4EFB\u52A1" : "\u4EFB\u52A1\u5C1A\u672A\u5B8C\u6210" }) })
  ] });
}
function NpcConversation({ npc, ...props }) {
  const { state: s, data: d, busy } = props;
  const [section, setSection] = useState6(npc.roles[0]);
  const current = npc.roles.includes(section) ? section : npc.roles[0];
  const quests = d.quests.filter((q) => npc.accepts.includes(q.id) || npc.turnIns.includes(q.id));
  const canInteract = !s.combat && !s.escort && s.hp > 0 && ["idle", "hunt"].includes(s.activity.type);
  const serviceData = { ...d, shop: current === "shop" ? d.shop.filter((i) => npc.stockIds.includes(i.id)) : d.shop, city: { ...d.city, canInteract, junkCount: s.bag.filter((i) => d.items[i.id]?.quality === 0 && !i.locked).length } };
  return /* @__PURE__ */ jsxs9(Fragment3, { children: [
    /* @__PURE__ */ jsx11("div", { className: "filterbar npc-service-tabs", "aria-label": "\u4EA4\u8C08\u5185\u5BB9", children: npc.roles.map((role) => /* @__PURE__ */ jsx11("button", { "aria-pressed": current === role, className: current === role ? "active" : "", onClick: () => setSection(role), children: names[role] }, role)) }),
    !canInteract && /* @__PURE__ */ jsx11("p", { role: "status", children: "\u62B5\u8FBE\u5E76\u8131\u79BB\u6218\u6597\u540E\uFF0C\u5373\u53EF\u4E0E\u8FD9\u91CC\u7684\u4EBA\u7269\u4EA4\u4E92\u3002" }),
    current === "quests" ? /* @__PURE__ */ jsx11("div", { children: quests.length ? quests.map((q) => /* @__PURE__ */ jsx11(QuestConversation, { ...props, busy: busy || !canInteract, quest: q }, q.id)) : /* @__PURE__ */ jsx11("p", { className: "empty", children: "\u6682\u65F6\u6CA1\u6709\u65B0\u7684\u59D4\u6258\u3002\u795D\u4F60\u65C5\u9014\u5E73\u5B89\u3002" }) }) : /* @__PURE__ */ jsx11(CityServicePanel, { ...props, data: serviceData, service: { id: current, name: names[current], npc: npc.name, description: "", greeting: "" } })
  ] });
}
function LocalNpcs(props) {
  const { state: s, data: d } = props, [selected, setSelected] = useState6(null);
  const npcs = (d.interactions || []).filter((n) => !d.city || n.roles.includes("quests")), npc = selected && selected.location === s.location ? npcs.find((n) => n.key === selected.npc.key) || { ...selected.npc, accepts: [], turnIns: [] } : null;
  return /* @__PURE__ */ jsxs9("section", { id: "local-people", className: "local-people", "aria-label": "\u9644\u8FD1\u4EBA\u7269", children: [
    /* @__PURE__ */ jsxs9("div", { className: "section-heading", children: [
      /* @__PURE__ */ jsxs9("div", { children: [
        /* @__PURE__ */ jsx11("div", { className: "eyebrow", children: "\u4E0E\u4E16\u754C\u4EA4\u8C08" }),
        /* @__PURE__ */ jsx11("h2", { children: "\u9644\u8FD1\u4EBA\u7269" })
      ] }),
      /* @__PURE__ */ jsx11("small", { children: "\u9009\u62E9\u4EBA\u7269\uFF0C\u67E5\u770B\u4EFB\u52A1\u4E0E\u670D\u52A1" })
    ] }),
    /* @__PURE__ */ jsx11("div", { className: "npc-grid", children: npcs.map((n) => /* @__PURE__ */ jsxs9("button", { className: "npc-card", onClick: () => setSelected({ npc: n, location: s.location }), children: [
      /* @__PURE__ */ jsx11(NpcPortrait, { npc: n }),
      /* @__PURE__ */ jsxs9("span", { className: "npc-card-copy", children: [
        /* @__PURE__ */ jsx11("strong", { children: n.name }),
        /* @__PURE__ */ jsx11("small", { children: n.roles.map((r) => names[r]).join(" \xB7 ") }),
        /* @__PURE__ */ jsx11("span", { children: n.turnIns.length ? "\u67E5\u770B\u4EFB\u52A1\u8FDB\u5EA6" : n.accepts.length ? `${n.accepts.length} \u4E2A\u53EF\u63A5\u4EFB\u52A1` : "\u70B9\u51FB\u4EA4\u8C08" })
      ] }),
      (n.accepts.length > 0 || n.turnIns.length > 0) && /* @__PURE__ */ jsx11("span", { className: "quest-mark" + (n.turnIns.length && !d.quests.some((q) => n.turnIns.includes(q.id) && q.complete) ? " incomplete" : ""), children: n.turnIns.length ? "?" : "!" })
    ] }, n.key)) }),
    !npcs.length && /* @__PURE__ */ jsx11("p", { className: "empty", children: "\u8FD9\u91CC\u6CA1\u6709\u53EF\u4EA4\u8C08\u7684\u4EBA\u7269\u3002\u6253\u5F00\u5730\u56FE\uFF0C\u524D\u5F80\u9644\u8FD1\u57CE\u9547\u3002" }),
    /* @__PURE__ */ jsx11(Dialog, { open: !!npc, onOpenChange: (open) => {
      if (!open) setSelected(null);
    }, children: /* @__PURE__ */ jsxs9(DialogContent, { className: "npc-dialog", children: [
      /* @__PURE__ */ jsx11(DialogHeader, { children: /* @__PURE__ */ jsxs9("div", { className: "npc-dialog-heading", children: [
        npc && /* @__PURE__ */ jsx11(NpcPortrait, { npc }),
        /* @__PURE__ */ jsxs9("div", { children: [
          /* @__PURE__ */ jsx11(DialogTitle, { children: npc?.name || "\u4EBA\u7269\u4EA4\u8C08" }),
          /* @__PURE__ */ jsxs9(DialogDescription, { children: [
            d.location.name,
            " \xB7 ",
            npc?.roles.map((r) => names[r]).join(" / ")
          ] })
        ] })
      ] }) }),
      npc && /* @__PURE__ */ jsx11(NpcConversation, { ...props, npc }, s.id + ":" + s.location + ":" + npc.key)
    ] }) })
  ] });
}

// app/city.tsx
import { useRef, useState as useState7 } from "react";
import { jsx as jsx12, jsxs as jsxs10 } from "react/jsx-runtime";
function City(props) {
  const { state: s, data: d, busy, send } = props, city = d.city;
  const [selection, setSelection] = useState7(null);
  const [opened, setOpened] = useState7(null);
  const [filter, setFilter] = useState7("all");
  const serviceRef = useRef(null), districtRef = useRef(null);
  if (!city) return null;
  const districts = city.districts;
  const selected = districts.find((x) => x.id === (selection && selection.origin === s.location ? selection.id : s.location)) || districts[0];
  const current = districts.find((x) => x.id === s.location);
  const here = selected.id === s.location, locked = busy || !city.canInteract;
  const active = opened && opened.location === s.location && here ? selected.services.find((x) => x.id === opened.id) : null;
  const choose = (id) => {
    setSelection({ id, origin: s.location });
    setOpened(null);
  };
  const open = (service) => {
    if (service.id === "quests") {
      document.getElementById("local-people")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setOpened({ id: service.id, location: s.location });
    requestAnimationFrame(() => serviceRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };
  const guide = (id) => {
    setFilter(id);
    const dest = id === "trainer" ? city.trainer : districts.find((x) => x.services.some((a) => a.id === id))?.id;
    if (dest) choose(dest);
  };
  const visitService = (id) => {
    const dest = id === "trainer" ? city.trainer : districts.find((x) => x.services.some((a) => a.id === id))?.id;
    if (!dest) return;
    choose(dest);
    districtRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    if (dest === s.location) {
      const service = current.services.find((a) => a.id === id);
      if (service) open(service);
    }
  };
  const moving = s.activity.type === "travel";
  const travelLocked = busy || !!s.combat || s.hp <= 0 || locked && !(moving && !s.activity.flight);
  const free = d.bagCapacity - s.bag.length;
  const checklist = [
    { label: "\u6574\u7406\u884C\u56CA", detail: `\u80CC\u5305\u5269\u4F59 ${free} \u683C${city.junkCount ? ` \xB7 ${city.junkCount} \u7EC4\u7070\u8272\u6742\u7269` : ""}`, ready: free >= 4 && !city.junkCount, service: "shop", action: "\u62DC\u8BBF\u5546\u4EBA" },
    { label: "\u5B58\u653E\u6750\u6599", detail: city.materialCount ? `${city.materialCount} \u7EC4\u6750\u6599\u53EF\u5B58\u5165\u94F6\u884C` : "\u6750\u6599\u5DF2\u6574\u7406\u59A5\u5F53", ready: !city.materialCount, service: "bank", action: "\u524D\u5F80\u94F6\u884C" },
    { label: "\u65C5\u9014\u4F11\u6574", detail: `\u751F\u547D ${Math.ceil(s.hp)}/${d.stats.maxHp}${d.resource.max && d.resource.name === "\u6CD5\u529B" ? ` \xB7 \u6CD5\u529B ${Math.floor(d.resource.value)}/${d.resource.max}` : ""}`, ready: s.hp >= d.stats.maxHp && (d.resource.name !== "\u6CD5\u529B" || d.resource.value >= d.resource.max), service: "inn", action: "\u524D\u5F80\u65C5\u5E97" },
    { label: "\u7089\u77F3\u5F52\u5904", detail: `\u5DF2\u7ED1\u5B9A\uFF1A${d.hearthstone.destinationName}`, ready: s.hearth === "stormwind", service: "inn", action: "\u8BBE\u7F6E\u5F52\u5904" },
    { label: "\u72EE\u9E6B\u822A\u7EBF", detail: s.flightPoints.includes("stormwind") ? "\u66B4\u98CE\u57CE\u98DE\u884C\u70B9\u5DF2\u53D1\u73B0" : "\u4E0E\u72EE\u9E6B\u7BA1\u7406\u5458\u4EA4\u8C08", ready: s.flightPoints.includes("stormwind"), service: "flight", action: "\u53D1\u73B0\u822A\u7EBF" }
  ];
  return /* @__PURE__ */ jsxs10("section", { className: "city", "aria-label": "\u66B4\u98CE\u57CE\u4E3B\u57CE", children: [
    /* @__PURE__ */ jsxs10("header", { className: "city-header", children: [
      /* @__PURE__ */ jsxs10("div", { children: [
        /* @__PURE__ */ jsx12("div", { className: "city-kicker", children: "\u4EBA\u7C7B\u738B\u56FD \xB7 \u8054\u76DF\u4E3B\u57CE" }),
        /* @__PURE__ */ jsxs10("h1", { children: [
          "\u66B4\u98CE\u57CE ",
          /* @__PURE__ */ jsx12("span", { children: "STORMWIND" })
        ] }),
        /* @__PURE__ */ jsx12("p", { children: "\u9AD8\u5899\u4E4B\u5185\uFF0C\u7247\u523B\u5B89\u5B81\u3002\u6574\u987F\u884C\u88C5\uFF0C\u518D\u8D74\u8FDC\u65B9\u3002" })
      ] }),
      /* @__PURE__ */ jsxs10("div", { className: "city-location", children: [
        /* @__PURE__ */ jsx12("span", { className: "city-location-light" }),
        moving ? "\u65C5\u9014\u4E2D" : "\u5F53\u524D\u6240\u5728",
        /* @__PURE__ */ jsx12("strong", { children: moving ? d.map.find((n) => n.id === s.activity.to)?.name || "\u76EE\u7684\u5730" : current.name })
      ] })
    ] }),
    /* @__PURE__ */ jsxs10("div", { className: "city-guide", children: [
      /* @__PURE__ */ jsx12("span", { children: "\u2727 \u536B\u5175\u6307\u8DEF" }),
      /* @__PURE__ */ jsxs10("label", { children: [
        /* @__PURE__ */ jsx12("span", { className: "sr-only", children: "\u5BFB\u627E\u4E3B\u57CE\u670D\u52A1" }),
        /* @__PURE__ */ jsxs10("select", { "aria-label": "\u5BFB\u627E\u4E3B\u57CE\u670D\u52A1", value: filter, onChange: (e) => e.target.value === "all" ? setFilter("all") : guide(e.target.value), children: [
          /* @__PURE__ */ jsx12("option", { value: "all", children: "\u4F60\u60F3\u53BB\u54EA\u91CC\uFF1F" }),
          [["bank", "\u94F6\u884C"], ["auction", "\u62CD\u5356\u884C"], ["trainer", d.className + "\u8BAD\u7EC3\u5E08"], ["professions", "\u751F\u6D3B\u804C\u4E1A\u4E0E\u5DE5\u574A"], ["inn", "\u65C5\u5E97"], ["shop", "\u5546\u4EBA"], ["flight", "\u72EE\u9E6B\u7BA1\u7406\u5458"], ["tram", "\u77FF\u9053\u5730\u94C1"]].map(([id, name]) => /* @__PURE__ */ jsx12("option", { value: id, children: name }, id))
        ] })
      ] }),
      /* @__PURE__ */ jsx12("p", { children: filter === "all" ? "\u70B9\u9009\u57CE\u533A\u67E5\u770B\u670D\u52A1\uFF0C\u6216\u8BF7\u536B\u5175\u4E3A\u4F60\u6307\u8DEF\u3002" : `\u5DF2\u6807\u51FA\u76EE\u7684\u5730\uFF1A${selected.name}\u3002${here ? "\u4F60\u5C31\u5728\u9644\u8FD1\u3002" : "\u62B5\u8FBE\u540E\u5373\u53EF\u529E\u7406\u3002"}` }),
      /* @__PURE__ */ jsx12("button", { className: "city-text-button", onClick: () => {
        setFilter("all");
        choose(s.location);
      }, children: "\u5B9A\u4F4D\u81EA\u5DF1" })
    ] }),
    /* @__PURE__ */ jsxs10("div", { className: "city-explore", children: [
      /* @__PURE__ */ jsxs10("div", { className: "city-map-wrap", children: [
        /* @__PURE__ */ jsxs10("div", { className: "city-map", children: [
          /* @__PURE__ */ jsx12("img", { src: "/maps/stormwind-classic.jpg", alt: "\u66B4\u98CE\u57CE\u57CE\u533A\u5730\u56FE" }),
          /* @__PURE__ */ jsx12("div", { className: "city-map-shade" }),
          districts.map((district, index) => /* @__PURE__ */ jsxs10("button", { className: "city-pin " + (selected.id === district.id ? "selected " : "") + (s.location === district.id ? "current " : "") + (filter !== "all" && !district.services.some((a) => a.id === filter) ? "dimmed" : ""), style: { left: district.point[0] + "%", top: district.point[1] + "%" }, onClick: () => choose(district.id), "aria-label": `\u67E5\u770B${district.name}${s.location === district.id ? "\uFF0C\u5F53\u524D\u4F4D\u7F6E" : ""}`, "aria-pressed": selected.id === district.id, children: [
            /* @__PURE__ */ jsx12("span", { children: s.location === district.id ? "\u25C6" : String(index + 1).padStart(2, "0") }),
            /* @__PURE__ */ jsx12("b", { children: district.name })
          ] }, district.id))
        ] }),
        /* @__PURE__ */ jsxs10("div", { className: "city-map-caption", children: [
          /* @__PURE__ */ jsx12("span", { children: "\u25C6 \u5F53\u524D\u4F4D\u7F6E" }),
          /* @__PURE__ */ jsx12("span", { children: "\u91D1\u8272 \xB7 \u9009\u4E2D\u57CE\u533A" }),
          /* @__PURE__ */ jsx12("span", { children: "\u70B9\u9009\u9884\u89C8 \xB7 \u9053\u8DEF\u8BA1\u65F6\u65C5\u884C" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs10("aside", { ref: districtRef, className: "city-district", "aria-label": "\u57CE\u533A\u8BE6\u60C5", children: [
        /* @__PURE__ */ jsxs10("div", { className: "city-kicker", children: [
          String(districts.indexOf(selected) + 1).padStart(2, "0"),
          " / ",
          selected.subtitle
        ] }),
        /* @__PURE__ */ jsx12("h2", { children: selected.name }),
        /* @__PURE__ */ jsx12("p", { children: selected.description }),
        /* @__PURE__ */ jsxs10("div", { className: "city-district-status", children: [
          /* @__PURE__ */ jsx12("span", { children: here ? "\u25C6 \u4F60\u5728\u8FD9\u91CC" : selected.visited ? "\u66FE\u7ECF\u5230\u8BBF" : "\u5C1A\u672A\u5230\u8BBF" }),
          /* @__PURE__ */ jsx12("span", { children: here ? "\u6B65\u884C\u5373\u53EF\u529E\u7406" : selected.travel === null ? "\u6682\u65E0\u8FDE\u901A\u8DEF\u7EBF" : `\u8DEF\u7A0B ${duration(selected.travel)}` })
        ] }),
        (!here || moving) && /* @__PURE__ */ jsxs10(Button, { className: "city-travel", disabled: travelLocked || selected.travel === null || moving && selected.id === s.activity.to, onClick: () => send({ type: "travel", to: selected.id }), children: [
          moving ? "\u6539\u9053\u524D\u5F80" : "\u524D\u5F80",
          selected.name,
          " \u2197"
        ] }),
        /* @__PURE__ */ jsx12("div", { className: "city-service-list", children: selected.services.map((service) => /* @__PURE__ */ jsxs10("button", { className: active?.id === service.id ? "active" : "", disabled: !here || locked, onClick: () => open(service), children: [
          /* @__PURE__ */ jsx12(CreaturePortrait, { unit: { entry: serviceModels[service.id] }, className: "city-service-portrait" }),
          /* @__PURE__ */ jsxs10("div", { children: [
            /* @__PURE__ */ jsx12("strong", { children: service.name }),
            /* @__PURE__ */ jsx12("small", { children: here ? service.npc : "\u62B5\u8FBE\u540E\u529E\u7406" })
          ] }),
          /* @__PURE__ */ jsx12("span", { "aria-hidden": "true", children: "\u2197" })
        ] }, service.id)) }),
        locked && /* @__PURE__ */ jsxs10("p", { className: "city-blocked", role: "status", children: [
          busy ? "\u6B63\u5728\u529E\u7406\uFF0C\u8BF7\u7A0D\u5019\u2026" : city.blockedReason,
          moving && ` \u5269\u4F59 ${duration(s.activity.endsAt - s.clock)}`
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx12("nav", { className: "city-district-nav", "aria-label": "\u66B4\u98CE\u57CE\u57CE\u533A\u5217\u8868", children: districts.map((district, index) => /* @__PURE__ */ jsxs10("button", { "aria-pressed": selected.id === district.id, onClick: () => choose(district.id), className: selected.id === district.id ? "active" : "", children: [
      /* @__PURE__ */ jsx12("small", { children: String(index + 1).padStart(2, "0") }),
      district.name
    ] }, district.id)) }),
    active && /* @__PURE__ */ jsxs10("div", { className: "city-service-panel", ref: serviceRef, "aria-label": active.name + "\u670D\u52A1\u9762\u677F", children: [
      /* @__PURE__ */ jsxs10("div", { className: "city-npc", children: [
        /* @__PURE__ */ jsx12(CreaturePortrait, { unit: { entry: serviceModels[active.id] }, className: "city-service-portrait" }),
        /* @__PURE__ */ jsxs10("div", { className: "grow", children: [
          /* @__PURE__ */ jsxs10("div", { className: "city-kicker", children: [
            current.name,
            " / ",
            active.name
          ] }),
          /* @__PURE__ */ jsx12("h2", { children: active.npc }),
          /* @__PURE__ */ jsxs10("p", { children: [
            "\u201C",
            active.greeting,
            "\u201D"
          ] })
        ] }),
        /* @__PURE__ */ jsx12(Button, { variant: "ghost", "aria-label": "\u5173\u95ED\u4E3B\u57CE\u670D\u52A1", onClick: () => setOpened(null), children: "\u5173\u95ED \xD7" })
      ] }),
      /* @__PURE__ */ jsx12(CityServicePanel, { service: active, ...props }, active.id + ":" + s.location)
    ] }),
    /* @__PURE__ */ jsxs10("div", { className: "city-bottom", children: [
      /* @__PURE__ */ jsxs10("section", { className: "city-readiness", children: [
        /* @__PURE__ */ jsxs10("div", { className: "city-section-heading", children: [
          /* @__PURE__ */ jsxs10("div", { children: [
            /* @__PURE__ */ jsx12("div", { className: "city-kicker", children: "\u51FA\u53D1\u524D\u7684\u7247\u523B" }),
            /* @__PURE__ */ jsx12("h2", { children: "\u6574\u88C5\u5F85\u53D1" })
          ] }),
          /* @__PURE__ */ jsxs10("span", { children: [
            checklist.filter((c) => c.ready).length,
            " / ",
            checklist.length,
            " \u9879\u5C31\u7EEA"
          ] })
        ] }),
        /* @__PURE__ */ jsx12("div", { className: "city-checklist", children: checklist.map((item) => /* @__PURE__ */ jsxs10("div", { children: [
          /* @__PURE__ */ jsx12("span", { className: item.ready ? "ready" : "", children: item.ready ? "\u2713" : "\u25CB" }),
          /* @__PURE__ */ jsxs10("div", { className: "grow", children: [
            /* @__PURE__ */ jsx12("strong", { children: item.label }),
            /* @__PURE__ */ jsx12("small", { children: item.detail })
          ] }),
          /* @__PURE__ */ jsxs10("button", { className: "city-text-button", onClick: () => visitService(item.service), children: [
            item.ready ? "\u67E5\u770B" : item.action,
            " \u2197"
          ] })
        ] }, item.label)) })
      ] }),
      /* @__PURE__ */ jsxs10("section", { className: "city-departures", children: [
        /* @__PURE__ */ jsx12("div", { className: "city-kicker", children: "\u57CE\u95E8\u4E4B\u5916" }),
        /* @__PURE__ */ jsx12("h2", { children: "\u4E0B\u4E00\u6BB5\u65C5\u7A0B" }),
        /* @__PURE__ */ jsx12("p", { children: "\u6CBF\u719F\u6089\u7684\u9053\u8DEF\uFF0C\u56DE\u5230\u4F60\u7684\u5192\u9669\u4E2D\u3002" }),
        city.departures.map((dest) => /* @__PURE__ */ jsxs10("button", { disabled: travelLocked || dest.travel === null || moving && dest.to === s.activity.to, onClick: () => send({ type: "travel", to: dest.to }), children: [
          /* @__PURE__ */ jsxs10("div", { children: [
            /* @__PURE__ */ jsx12("strong", { children: dest.name }),
            /* @__PURE__ */ jsx12("small", { children: dest.description })
          ] }),
          /* @__PURE__ */ jsxs10("span", { children: [
            dest.travel === null ? "\u4E0D\u53EF\u8FBE" : duration(dest.travel),
            " \u2197"
          ] })
        ] }, dest.to))
      ] })
    ] })
  ] });
}

// app/world-map.tsx
import { useEffect as useEffect2, useState as useState8 } from "react";

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
import { jsx as jsx13, jsxs as jsxs11 } from "react/jsx-runtime";
function useTravelElapsed(clock, startedAt, endsAt, moving) {
  const [sample, setSample] = useState8({ clock, startedAt, endsAt, elapsed: 0 });
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
  const [selection, setSelection] = useState8(null);
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
  return /* @__PURE__ */ jsxs11("section", { className: "panel map-panel", "aria-label": "\u533A\u57DF\u5730\u56FE", children: [
    /* @__PURE__ */ jsxs11("div", { className: "map-toolbar", children: [
      /* @__PURE__ */ jsx13("div", { className: "filterbar", children: Object.entries(mapRegions).map(([id, r]) => /* @__PURE__ */ jsx13("button", { className: region === id ? "active" : "", "aria-pressed": region === id, onClick: () => select(id), children: r.name }, id)) }),
      /* @__PURE__ */ jsx13(Button, { variant: "outline", size: "sm", onClick: () => select(player?.region || mapRegion(d.location.region)), children: "\u5B9A\u4F4D\u73A9\u5BB6" })
    ] }),
    /* @__PURE__ */ jsxs11("div", { className: "map-status", role: "status", children: [
      /* @__PURE__ */ jsx13("strong", { children: moving ? `${s.activity.flight ? "\u98DE\u884C" : "\u884C\u8FDB"}\u4E2D \u2192 ${d.map.find((n) => n.id === s.activity.to)?.name}` : `\u5F53\u524D\u4F4D\u7F6E\uFF1A${d.location.name}` }),
      /* @__PURE__ */ jsxs11("span", { children: [
        moving ? frame.remaining > 0 ? `\u5269\u4F59 ${duration(frame.remaining)}` : "\u7B49\u5F85\u62B5\u8FBE\u786E\u8BA4" : "\u70B9\u51FB\u5730\u56FE\u4E0A\u7684\u5730\u70B9\u51FA\u53D1",
        player?.region !== region ? " \xB7 \u73A9\u5BB6\u5728\u5176\u4ED6\u533A\u57DF" : "",
        player?.crossing ? " \xB7 \u8DE8\u533A\u9014\u4E2D" : ""
      ] })
    ] }),
    moving && waypointIds.length > 0 && /* @__PURE__ */ jsx13("ol", { className: "map-waypoints", "aria-label": "\u6CBF\u9014\u8DEF\u70B9", children: waypointIds.map((id, index) => {
      const passed = index === 0 || routeLegs[index - 1].progress >= 1, next = index === nextLeg + 1 && nextLeg >= 0;
      return /* @__PURE__ */ jsxs11("li", { className: next ? "is-next" : passed ? "is-passed" : "", "aria-current": next ? "step" : void 0, children: [
        /* @__PURE__ */ jsx13("span", { "aria-hidden": "true", children: passed ? "\u2713" : index }),
        /* @__PURE__ */ jsx13("b", { children: index === 0 && routeLegs[0].startProgress > 0 ? "\u6539\u9053\u4F4D\u7F6E" : d.map.find((n) => n.id === id)?.name || id }),
        next && /* @__PURE__ */ jsx13("small", { children: "\u4E0B\u4E00\u7AD9" })
      ] }, `${index}:${id}`);
    }) }),
    /* @__PURE__ */ jsx13("div", { className: "region-map-scroll", tabIndex: 0, "aria-label": "\u5730\u70B9\u5730\u56FE\uFF0C\u7A84\u5C4F\u53EF\u6A2A\u5411\u6EDA\u52A8", children: /* @__PURE__ */ jsxs11("div", { className: "region-map " + (!config.image ? "schematic-map" : ""), children: [
      config.image ? /* @__PURE__ */ jsx13("img", { className: "region-map-art", src: config.image, alt: config.name + "\u533A\u57DF\u5730\u56FE" }) : /* @__PURE__ */ jsxs11("div", { className: "courier-background", children: [
        /* @__PURE__ */ jsx13("strong", { children: "\u4FE1\u4F7F\u8DEF\u7EBF" }),
        /* @__PURE__ */ jsx13("span", { children: "\u8DE8\u533A\u57DF\u9A7F\u7AD9\u793A\u610F\u56FE" })
      ] }),
      /* @__PURE__ */ jsx13("svg", { className: "map-route", viewBox: "0 0 100 100", preserveAspectRatio: "none", "aria-hidden": "true", children: legs.map((leg, i) => {
        const a = at(leg.from), b = at(leg.to);
        return /* @__PURE__ */ jsxs11("g", { children: [
          /* @__PURE__ */ jsx13("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1] }),
          leg.progress > 0 && /* @__PURE__ */ jsx13("line", { className: "map-route-completed", x1: a[0] + (b[0] - a[0]) * leg.startProgress, y1: a[1] + (b[1] - a[1]) * leg.startProgress, x2: a[0] + (b[0] - a[0]) * leg.progress, y2: a[1] + (b[1] - a[1]) * leg.progress })
        ] }, i);
      }) }),
      points.map((n, i) => {
        const p = at(n.id), current = !moving && n.id === s.location;
        if (!p) return null;
        const flight = n.hasFlight ? ` \xB7 \u9E1F\u70B9${n.flightUnlocked ? "\u5DF2\u89E3\u9501" : "\u672A\u53D1\u73B0"}` : "";
        return /* @__PURE__ */ jsxs11("button", { className: "map-pin " + (current ? "is-current " : "") + (n.id === s.activity.to ? "is-destination " : "") + (n.hasFlight ? "has-flight " : ""), style: { left: p[0] + "%", top: p[1] + "%" }, disabled: locked || (moving ? n.id === s.activity.to : n.id === s.location) || n.travel === null, onClick: () => travel(n.id), "aria-label": `${n.name}${current ? " \xB7 \u5F53\u524D\u4F4D\u7F6E" : ` \xB7 ${moving ? "\u6539\u9053\u524D\u5F80" : "\u524D\u5F80"} \xB7 ${n.travel === null ? "\u9700\u4F20\u9001\u62B5\u8FBE" : duration(n.travel)}`}${flight}`, title: `${n.name} \xB7 Lv.${n.min}\u2014${n.max}${flight}`, children: [
          /* @__PURE__ */ jsx13("span", { className: "map-pin-dot", children: n.hasFlight ? "\u2197" : n.kind === "dungeon" ? "\u2694" : i + 1 }),
          /* @__PURE__ */ jsxs11("span", { className: "map-pin-label", children: [
            n.name,
            n.hasFlight && /* @__PURE__ */ jsxs11("small", { className: n.flightUnlocked ? "flight-discovered" : "", children: [
              "\u2197 ",
              n.flightUnlocked ? "\u9E1F\u70B9\u5DF2\u89E3\u9501" : "\u9E1F\u70B9\u672A\u53D1\u73B0"
            ] })
          ] })
        ] }, n.id);
      }),
      player && player.region === region && /* @__PURE__ */ jsxs11("div", { className: "map-player" + (moving ? " is-moving" : ""), style: { left: player.x + "%", top: player.y + "%" }, role: "img", "aria-label": moving ? "\u73A9\u5BB6\u4F4D\u7F6E\uFF1A\u65C5\u884C\u4E2D" : "\u73A9\u5BB6\u5F53\u524D\u4F4D\u7F6E", children: [
        /* @__PURE__ */ jsx13("span", { children: "\u25B2" }),
        /* @__PURE__ */ jsx13("b", { children: moving ? s.activity.flight ? "\u98DE\u884C\u4E2D" : "\u884C\u8FDB\u4E2D" : "\u4F60\u5728\u8FD9\u91CC" })
      ] }, region)
    ] }) }),
    /* @__PURE__ */ jsxs11("div", { className: "map-legend", children: [
      /* @__PURE__ */ jsx13("span", { children: "\u25B2 \u73A9\u5BB6" }),
      /* @__PURE__ */ jsx13("span", { children: "\u6570\u5B57 / \u2694 \u5730\u70B9" }),
      /* @__PURE__ */ jsx13("span", { children: "\u2197 \u9E1F\u70B9\uFF08\u6807\u6CE8\u89E3\u9501\u72B6\u6001\uFF09" }),
      /* @__PURE__ */ jsx13("span", { children: "\u865A\u7EBF\uFF1A\u5F85\u884C\u8FDB \xB7 \u84DD\u7EBF\uFF1A\u5DF2\u8D70\u8FC7" })
    ] }),
    /* @__PURE__ */ jsxs11("details", { className: "map-location-list", children: [
      /* @__PURE__ */ jsxs11("summary", { children: [
        "\u5730\u70B9\u5217\u8868 \xB7 ",
        points.length,
        " \u4E2A\u5730\u70B9"
      ] }),
      /* @__PURE__ */ jsx13("div", { className: "location-grid", children: points.map((n, i) => /* @__PURE__ */ jsxs11("button", { disabled: locked || (moving ? n.id === s.activity.to : n.id === s.location) || n.travel === null, className: "location-node " + (n.id === s.location ? "current" : ""), onClick: () => travel(n.id), children: [
        /* @__PURE__ */ jsxs11("strong", { children: [
          i + 1,
          ". ",
          n.name
        ] }),
        /* @__PURE__ */ jsx13("small", { children: !moving && n.id === s.location ? "\u5F53\u524D\u4F4D\u7F6E" : `Lv.${n.min}\u2014${n.max} \xB7 ${n.travel === null ? "\u9700\u4F20\u9001\u62B5\u8FBE" : duration(n.travel)}` }),
        n.hasFlight && /* @__PURE__ */ jsxs11("small", { children: [
          "\u2197 ",
          n.flightUnlocked ? "\u9E1F\u70B9\u5DF2\u89E3\u9501" : "\u9E1F\u70B9\u672A\u53D1\u73B0"
        ] })
      ] }, n.id)) })
    ] }),
    /* @__PURE__ */ jsxs11("p", { className: "footnote", children: [
      moving ? s.activity.flight ? "\u98DE\u884C\u671F\u95F4\u4E0D\u53EF\u6539\u9053\u3002" : "\u70B9\u51FB\u5176\u4ED6\u5730\u70B9\u53EF\u968F\u65F6\u6539\u9053\u6216\u6298\u8FD4\uFF0C\u6309\u5F53\u524D\u4F4D\u7F6E\u8BA1\u7B97\u8DEF\u7A0B\u3002" : "",
      "\u5730\u70B9\u6309\u533A\u57DF\u5730\u56FE\u8FD1\u4F3C\u6807\u6CE8\uFF1B\u79FB\u52A8\u6CBF\u73B0\u6709\u9053\u8DEF\u8BA1\u65F6\u3002\u9E1F\u70B9\u9700\u5230\u98DE\u884C\u7BA1\u7406\u5458\u5904\u53D1\u73B0\u3002",
      region === "\u4FE1\u4F7F\u8DEF\u7EBF" ? "\u4FE1\u4F7F\u8DEF\u7EBF\u4E3A\u9A7F\u7AD9\u793A\u610F\uFF0C\u4E0D\u4EE3\u8868\u5730\u7406\u6BD4\u4F8B\u3002" : ""
    ] })
  ] });
}

// app/mounts.tsx
import { jsx as jsx14, jsxs as jsxs12 } from "react/jsx-runtime";
function Mounts({ state: s, data: d, busy, send }) {
  const m = d.mounts;
  if (!m) return null;
  const casting = s.activity.type === "mount", collection = m.collection;
  const owned = collection.filter((h) => h.owned), ready = owned.find((h) => h.canMount);
  const canTravel = !busy && !s.dungeon && !s.escort && !s.combat && s.hp > 0 && ["idle", "hunt"].includes(s.activity.type);
  const status = casting ? "\u6B63\u5728\u4E0A\u9A6C" : m.active ? `${m.activeName} \xB7 \u79FB\u52A8\u901F\u5EA6 +${m.speedBonus}%` : owned.length ? `\u5DF2\u62E5\u6709 ${owned.length} \u5339\u5750\u9A91` : s.level < m.level ? `${m.level} \u7EA7\u89E3\u9501\u9A91\u4E58` : "\u524D\u5F80\u4E1C\u8C37\u5B66\u4E60\u9A91\u672F";
  return /* @__PURE__ */ jsxs12("section", { className: "panel mounts-panel", "aria-label": "\u5750\u9A91", children: [
    /* @__PURE__ */ jsxs12("div", { className: "mounts-heading", children: [
      /* @__PURE__ */ jsx14("span", { className: "mounts-emblem " + (m.active ? "is-riding" : ""), "aria-hidden": "true", children: "\u265E" }),
      /* @__PURE__ */ jsxs12("div", { className: "grow", children: [
        /* @__PURE__ */ jsx14("strong", { children: "\u5750\u9A91" }),
        /* @__PURE__ */ jsx14("small", { role: "status", children: status })
      ] }),
      casting ? /* @__PURE__ */ jsx14(Button, { variant: "outline", disabled: busy, onClick: () => send({ type: "stop" }), children: "\u53D6\u6D88\u4E0A\u9A6C" }) : m.active ? /* @__PURE__ */ jsx14(Button, { variant: "outline", disabled: busy || !m.canDismount, title: m.dismountReason || "\u6536\u8D77\u5750\u9A91", onClick: () => send({ type: "dismount" }), children: "\u4E0B\u9A6C" }) : ready ? /* @__PURE__ */ jsxs12(Button, { disabled: busy, onClick: () => send({ type: "mount", id: ready.id }), children: [
        "\u9A91\u4E58",
        ready.name
      ] }) : null
    ] }),
    casting && /* @__PURE__ */ jsxs12("p", { className: "footnote", children: [
      "\u53EC\u5524",
      collection.find((h) => h.id === s.activity.mount)?.name,
      " \xB7 \u5269\u4F59 ",
      duration(s.activity.endsAt - s.clock)
    ] }),
    /* @__PURE__ */ jsxs12("details", { className: "mounts-collection", children: [
      /* @__PURE__ */ jsxs12("summary", { children: [
        "\u9A6C\u5339\u6536\u85CF\u4E0E\u9A91\u672F ",
        /* @__PURE__ */ jsxs12("span", { children: [
          owned.length,
          " / ",
          collection.length
        ] })
      ] }),
      /* @__PURE__ */ jsxs12("div", { className: "mounts-training", children: [
        /* @__PURE__ */ jsxs12("div", { className: "grow", children: [
          /* @__PURE__ */ jsxs12("strong", { children: [
            "\u9A6C\u5339\u9A91\u672F ",
            /* @__PURE__ */ jsx14("span", { children: m.trained ? "\u5DF2\u5B66\u4F1A" : `${m.level} \u7EA7\u53EF\u5B66` })
          ] }),
          /* @__PURE__ */ jsx14("p", { children: m.trained ? "\u5DF2\u89E3\u9501\u9A6C\u5339\u9A91\u4E58\uFF0C\u53EF\u5728\u4E0B\u65B9\u9009\u62E9\u5750\u9A91\u3002" : `\u8BAD\u7EC3\u8D39\u7528 ${money(m.trainingPrice)} \xB7 ${m.serviceName}` }),
          !m.trained && /* @__PURE__ */ jsx14("small", { children: m.trainingReason })
        ] }),
        !m.trained && /* @__PURE__ */ jsx14(Button, { variant: "outline", disabled: busy || !m.canTrain, title: m.trainingReason || "\u5B66\u4E60\u9A6C\u5339\u9A91\u672F", onClick: () => send({ type: "trainRiding" }), children: "\u5B66\u4E60\u9A91\u672F" }),
        s.location !== m.serviceLocation && !s.dungeon && /* @__PURE__ */ jsx14(Button, { variant: "outline", disabled: !canTravel, onClick: () => send({ type: "travel", to: m.serviceLocation }), children: "\u524D\u5F80\u4E1C\u8C37" })
      ] }),
      /* @__PURE__ */ jsx14("div", { className: "mounts-grid", children: collection.map((h) => {
        const active = m.active === h.id, reason = h.owned ? h.reason : h.purchaseReason;
        return /* @__PURE__ */ jsxs12("article", { className: "mount-card " + (active ? "mount-active" : ""), children: [
          /* @__PURE__ */ jsxs12("div", { className: "mount-portrait mount-tone-" + h.tone, "aria-hidden": "true", children: [
            /* @__PURE__ */ jsx14("span", { children: "\u265E" }),
            /* @__PURE__ */ jsxs12("b", { children: [
              "+",
              h.bonus,
              "%"
            ] })
          ] }),
          /* @__PURE__ */ jsxs12("div", { className: "mount-card-body", children: [
            /* @__PURE__ */ jsxs12("div", { className: "mount-card-title", children: [
              /* @__PURE__ */ jsx14("strong", { children: h.name }),
              h.owned && /* @__PURE__ */ jsx14("span", { children: active ? "\u9A91\u4E58\u4E2D" : "\u5DF2\u62E5\u6709" })
            ] }),
            /* @__PURE__ */ jsxs12("p", { children: [
              h.level,
              " \u7EA7 \xB7 \u79FB\u901F +",
              h.bonus,
              "%",
              !h.owned ? ` \xB7 ${money(h.price)}` : ""
            ] }),
            /* @__PURE__ */ jsx14("small", { className: "mount-requirement", children: active ? "\u6237\u5916\u65C5\u884C\u52A0\u901F\uFF0C\u8FDB\u5165\u53D7\u9650\u8DEF\u6BB5\u81EA\u52A8\u4E0B\u9A6C\u3002" : reason || (h.owned ? "3 \u79D2\u53EC\u5524\uFF0C\u9A91\u4E58\u540E\u51FA\u53D1\u5373\u53EF\u52A0\u901F\u3002" : "\u53EF\u5411\u4E1C\u8C37\u7684\u51EF\u8482\xB7\u4EA8\u7279\u8D2D\u4E70\u3002") }),
            /* @__PURE__ */ jsx14(Button, { variant: active ? "secondary" : "outline", disabled: busy || casting || (h.owned ? active ? !m.canDismount : !h.canMount : !h.canBuy), title: active ? m.dismountReason : reason, onClick: () => send(active ? { type: "dismount" } : h.owned ? { type: "mount", id: h.id } : { type: "buyMount", id: h.id }), children: active ? "\u4E0B\u9A6C" : h.owned ? "\u9A91\u4E58" : "\u8D2D\u4E70\u5750\u9A91" })
          ] })
        ] }, h.id);
      }) }),
      /* @__PURE__ */ jsx14("p", { className: "footnote", children: "\u666E\u901A\u9A6C\u5728 20 \u7EA7\u89E3\u9501\uFF0C\u8FC5\u6377\u9A6C\u9700\u8981 60 \u7EA7\u3002\u9A6C\u5339\u4EC5\u4F9B\u8054\u76DF\u9A91\u4E58\uFF1B\u975E\u4EBA\u7C7B\u89D2\u8272\u9700\u66B4\u98CE\u57CE\u58F0\u671B\u5D07\u62DC\u3002\u6B64\u5904\u6536\u5F55\u4E1C\u8C37\u51FA\u552E\u7684\u9A6C\u5339\u3002" })
    ] })
  ] });
}

// app/escort.tsx
import { Fragment as Fragment4, jsx as jsx15, jsxs as jsxs13 } from "react/jsx-runtime";
function Escort({ state: s, data: d, busy, send }) {
  const e = d.escort;
  if (!e) return null;
  return /* @__PURE__ */ jsxs13("section", { className: "panel", "aria-label": "\u62A4\u9001\u8FEA\u83F2\u4E9A\u53DB\u5F92", children: [
    /* @__PURE__ */ jsxs13("div", { className: "section-heading", children: [
      /* @__PURE__ */ jsxs13("h2", { className: "escort-identity", children: [
        /* @__PURE__ */ jsx15(CreaturePortrait, { unit: { entry: 467 } }),
        "\u62A4\u9001\u8FEA\u83F2\u4E9A\u53DB\u5F92"
      ] }),
      /* @__PURE__ */ jsx15("small", { children: e.active ? `${e.index} / ${e.total} \u8DEF\u6BB5` : "\u54E8\u5175\u5CAD \u2192 \u6708\u6EAA\u9547" })
    ] }),
    e.active ? /* @__PURE__ */ jsxs13(Fragment4, { children: [
      /* @__PURE__ */ jsx15(Bar, { label: "\u53DB\u5F92\u751F\u547D", value: e.hp, max: e.maxHp }),
      /* @__PURE__ */ jsx15("p", { children: e.cancelled ? "\u505C\u6B62\u8BF7\u6C42\u5DF2\u8BB0\u5F55\uFF0C\u7B49\u5F85\u5F53\u524D\u6218\u6597\u7ED3\u675F\u3002" : s.combat ? "\u4FDD\u62A4\u53DB\u5F92\uFF0C\u51FB\u9000\u6CBF\u9014\u654C\u4EBA\u3002" : `\u6B63\u5728\u8DDF\u968F\u53DB\u5F92${e.endsAt ? " \xB7 \u4E0B\u4E00\u8DEF\u6BB5 " + duration(Math.max(0, e.endsAt - s.clock)) : ""}` }),
      /* @__PURE__ */ jsx15(Button, { variant: "outline", disabled: busy || e.cancelled, onClick: () => send({ type: "escortCancel" }), children: "\u505C\u6B62\u62A4\u9001" })
    ] }) : /* @__PURE__ */ jsxs13(Fragment4, { children: [
      /* @__PURE__ */ jsx15("p", { children: "\u8DDF\u968F\u53DB\u5F92\u524D\u5F80\u79D8\u5BC6\u5165\u53E3\u3002\u9014\u4E2D\u4ED6\u4F1A\u53D7\u5230\u653B\u51FB\uFF0C\u5B58\u6D3B\u62B5\u8FBE\u540E\u624D\u80FD\u56DE\u62A5\u4EFB\u52A1\u3002" }),
      e.last?.outcome === "failed" && /* @__PURE__ */ jsx15("p", { children: e.last.reason }),
      /* @__PURE__ */ jsx15(Button, { disabled: busy || !e.canStart, onClick: () => send({ type: "escortStart" }), children: s.location === "sentinel" ? "\u5F00\u59CB\u62A4\u9001" : "\u8BF7\u5148\u524D\u5F80\u54E8\u5175\u5CAD" })
    ] })
  ] });
}

// app/world.tsx
import { jsx as jsx16, jsxs as jsxs14 } from "react/jsx-runtime";
function World({ state: s, data: d, busy, revision, send, overview }) {
  const [filter, setFilter] = useState9("\u5168\u90E8"), [mapOpen, setMapOpen] = useState9(false);
  const questList = d.quests.filter((q) => q.active);
  const navigationLocked = busy || !!s.combat || s.hp <= 0 || !["idle", "hunt"].includes(s.activity.type);
  const navigate = async (id) => {
    if (await send({ type: "navigateQuest", id })) setMapOpen(true);
  };
  const navigationButton = (q) => q.navigation ? /* @__PURE__ */ jsxs14(Button, { variant: "outline", disabled: navigationLocked || q.navigation.here, onClick: () => navigate(q.id), children: [
    q.navigation.here ? q.navigation.kind === "turnin" ? "\u5DF2\u5230\u4EA4\u4ED8\u5730\u70B9" : "\u5DF2\u5728\u4EFB\u52A1\u533A\u57DF" : q.navigation.kind === "turnin" ? "\u524D\u5F80\u4EA4\u4ED8" : "\u524D\u5F80\u4EFB\u52A1\u533A\u57DF",
    " \u2197"
  ] }) : /* @__PURE__ */ jsx16("span", { className: "quest-navigation-note", children: "\u6682\u65E0\u53EF\u5BFC\u822A\u5730\u70B9\uFF0C\u8BF7\u67E5\u770B\u4EFB\u52A1\u8BF4\u660E" });
  if (s.dungeon) return /* @__PURE__ */ jsxs14("div", { className: "world-main", children: [
    /* @__PURE__ */ jsx16(PlayerHud, { state: s, data: d }),
    overview,
    /* @__PURE__ */ jsx16(Dungeon, { state: s, data: d, busy, send })
  ] });
  return /* @__PURE__ */ jsx16("div", { className: "world-layout " + (d.city ? "has-city" : " "), children: /* @__PURE__ */ jsxs14("section", { className: "world-main", children: [
    /* @__PURE__ */ jsx16("h1", { className: "journey-title", children: "\u7EE7\u7EED\u4F60\u7684\u65C5\u7A0B" }),
    /* @__PURE__ */ jsx16(PlayerHud, { state: s, data: d }),
    /* @__PURE__ */ jsxs14("section", { className: "journey-hero", "aria-labelledby": "journey-location-title", children: [
      /* @__PURE__ */ jsxs14("div", { className: "journey-hero-art", "aria-hidden": "true", children: [
        /* @__PURE__ */ jsx16("span", { className: "journey-sun" }),
        /* @__PURE__ */ jsx16("span", { className: "journey-mountains far" }),
        /* @__PURE__ */ jsx16("span", { className: "journey-mountains near" }),
        /* @__PURE__ */ jsx16("span", { className: "journey-tower", children: /* @__PURE__ */ jsx16("i", {}) }),
        /* @__PURE__ */ jsx16("span", { className: "journey-road" })
      ] }),
      /* @__PURE__ */ jsxs14("div", { className: "journey-hero-top", children: [
        /* @__PURE__ */ jsxs14("span", { children: [
          d.location.region,
          " \xB7 ",
          d.location.name
        ] }),
        /* @__PURE__ */ jsx16("span", { children: d.city ? "\u57CE\u9547\u533A\u57DF" : "\u91CE\u5916\u6D3B\u52A8" })
      ] }),
      /* @__PURE__ */ jsxs14("div", { className: "journey-hero-copy", children: [
        /* @__PURE__ */ jsx16("div", { className: "eyebrow", children: "THE ROAD AHEAD" }),
        /* @__PURE__ */ jsxs14("h2", { id: "journey-location-title", children: [
          "\u98CE\u5439\u8FC7",
          d.location.name
        ] }),
        /* @__PURE__ */ jsxs14("p", { children: [
          d.location.region,
          "\u4E4B\u5916\uFF0C\u662F\u901A\u5F80\u4E0B\u4E00\u6BB5\u65C5\u7A0B\u7684\u8DEF\u3002"
        ] }),
        /* @__PURE__ */ jsxs14(Button, { variant: "outline", onClick: () => setMapOpen(!mapOpen), children: [
          mapOpen ? "\u6536\u8D77\u533A\u57DF\u5730\u56FE" : "\u6253\u5F00\u533A\u57DF\u5730\u56FE",
          "\u3000\u2192"
        ] })
      ] })
    ] }),
    mapOpen && /* @__PURE__ */ jsx16(WorldMap, { state: s, data: d, busy, send }),
    " ",
    overview,
    (d.city || ["\u5168\u90E8", "\u4EBA\u7269\u4E0E\u670D\u52A1"].includes(filter)) && /* @__PURE__ */ jsx16(LocalNpcs, { state: s, data: d, busy, send }, s.id + ":" + s.location),
    " ",
    d.city && /* @__PURE__ */ jsx16(City, { state: s, data: d, busy, revision, send }, s.id + ":" + s.location),
    /* @__PURE__ */ jsxs14("details", { className: "panel travel-toolbox", children: [
      /* @__PURE__ */ jsxs14("summary", { children: [
        "\u65C5\u884C\u4E0E\u91CE\u5916\u6280\u80FD ",
        /* @__PURE__ */ jsx16("small", { children: "\u5750\u9A91 \xB7 \u62A4\u9001 \xB7 \u91C7\u96C6" })
      ] }),
      /* @__PURE__ */ jsxs14("div", { className: "travel-toolbox-content", children: [
        /* @__PURE__ */ jsx16(Mounts, { state: s, data: d, busy, send }),
        /* @__PURE__ */ jsx16(Escort, { state: s, data: d, busy, send }),
        /* @__PURE__ */ jsx16(Gathering, { state: s, data: d, busy, send })
      ] })
    ] }),
    (s.location === "deadmines" || d.location.region === "\u897F\u90E8\u8352\u91CE") && /* @__PURE__ */ jsx16(Dungeon, { state: s, data: d, busy, send }),
    !d.city && /* @__PURE__ */ jsx16("div", { className: "filterbar local-filters", children: ["\u5168\u90E8", "\u4EBA\u7269\u4E0E\u670D\u52A1", "\u602A\u7269", "\u4EFB\u52A1\u7269\u4EF6"].map((f) => /* @__PURE__ */ jsx16("button", { className: filter === f ? "active" : "", onClick: () => setFilter(f), children: f }, f)) }),
    (d.city || ["\u5168\u90E8", "\u4EFB\u52A1\u7269\u4EF6"].includes(filter)) && d.questTools?.length > 0 && /* @__PURE__ */ jsxs14("section", { className: "panel", children: [
      /* @__PURE__ */ jsx16("h2", { children: "\u4EFB\u52A1\u7269\u54C1" }),
      d.questTools.map((t) => /* @__PURE__ */ jsxs14("div", { className: "item-row", children: [
        /* @__PURE__ */ jsx16(Icon, { src: t.icon, name: t.name }),
        /* @__PURE__ */ jsxs14("div", { className: "grow", children: [
          /* @__PURE__ */ jsx16("strong", { children: t.name }),
          /* @__PURE__ */ jsx16("small", { children: t.place })
        ] }),
        /* @__PURE__ */ jsx16(Button, { variant: "outline", disabled: busy || s.location === t.location && !t.available, onClick: () => send(s.location === t.location ? { type: "useQuestItem", id: t.id } : { type: "travel", to: t.location }), children: s.location === t.location ? t.label : "\u524D\u5F80\u4F7F\u7528\u5730\u70B9" })
      ] }, t.id))
    ] }),
    !d.city && d.hasFlight && /* @__PURE__ */ jsx16(Button, { variant: "outline", disabled: busy || s.flightPoints.includes(s.location), onClick: () => send({ type: "unlockFlight" }), children: s.flightPoints.includes(s.location) ? "\u98DE\u884C\u70B9\u5DF2\u53D1\u73B0" : "\u4E0E\u98DE\u884C\u7BA1\u7406\u5458\u4EA4\u8C08 \xB7 \u53D1\u73B0\u98DE\u884C\u70B9" }),
    /* @__PURE__ */ jsxs14("div", { className: "interaction-grid", children: [
      (d.city || ["\u5168\u90E8", "\u602A\u7269"].includes(filter)) && d.monsters.map((m) => /* @__PURE__ */ jsxs14("button", { className: "interaction monster " + (m.min > s.level + 2 ? "danger" : ""), disabled: busy, onClick: () => send({ type: "hunt", id: m.id }), children: [
        /* @__PURE__ */ jsx16(CreaturePortrait, { unit: { entry: m.id }, className: "monster-portrait" }),
        /* @__PURE__ */ jsxs14("span", { className: "mob-level", children: [
          m.min === m.max ? m.min : `${m.min}\u2014${m.max}`,
          m.elite ? " \u7CBE\u82F1" : ""
        ] }),
        /* @__PURE__ */ jsx16("strong", { children: m.name }),
        /* @__PURE__ */ jsx16("small", { children: "\u5F00\u59CB\u81EA\u52A8\u72E9\u730E \u2192" })
      ] }, m.id)),
      (d.city || ["\u5168\u90E8", "\u4EFB\u52A1\u7269\u4EF6"].includes(filter)) && d.gatherables.map((o) => /* @__PURE__ */ jsxs14("button", { className: "interaction", disabled: busy, onClick: () => send({ type: "gather", id: o.id }), children: [
        /* @__PURE__ */ jsx16("span", { className: "quest-mark", children: "\u25C7" }),
        /* @__PURE__ */ jsx16("strong", { children: o.items[0]?.name || o.name }),
        /* @__PURE__ */ jsx16("small", { children: "\u8C03\u67E5 / \u91C7\u96C6 \xB7 5 \u79D2" })
      ] }, o.id))
    ] }),
    !d.city && d.hasFlight && s.flightPoints.includes(s.location) && s.flightPoints.filter((n) => n !== s.location).map((n) => /* @__PURE__ */ jsxs14(Button, { variant: "outline", onClick: () => send({ type: "fly", to: n }), children: [
      "\u98DE\u5F80 ",
      d.map.find((x) => x.id === n)?.name
    ] }, n)),
    /* @__PURE__ */ jsxs14("section", { id: "quest-list", className: "panel quest-panel", children: [
      /* @__PURE__ */ jsxs14("div", { className: "section-heading", children: [
        /* @__PURE__ */ jsxs14("div", { children: [
          /* @__PURE__ */ jsx16("div", { className: "eyebrow", children: "\u5192\u9669\u624B\u518C" }),
          /* @__PURE__ */ jsxs14("h2", { children: [
            "\u4EFB\u52A1\u65E5\u5FD7 ",
            /* @__PURE__ */ jsxs14("small", { children: [
              Object.keys(s.quests).length,
              " / 20"
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsx16("small", { children: "\u63A5\u53D7\u4E0E\u4EA4\u4ED8\u4EFB\u52A1\uFF0C\u8BF7\u4E0E\u5BF9\u5E94\u4EBA\u7269\u4EA4\u8C08" })
      ] }),
      !questList.length && /* @__PURE__ */ jsx16("p", { className: "empty", children: "\u8FD8\u6CA1\u6709\u6B63\u5728\u8FDB\u884C\u7684\u4EFB\u52A1\u3002\u70B9\u51FB\u9644\u8FD1\u5E26\u6709 ! \u6807\u8BB0\u7684\u4EBA\u7269\uFF0C\u5F00\u59CB\u4E00\u6BB5\u5192\u9669\u3002" }),
      questList.map((q) => /* @__PURE__ */ jsxs14("details", { className: "quest-entry", children: [
        /* @__PURE__ */ jsxs14("summary", { children: [
          /* @__PURE__ */ jsx16("span", { className: "quest-mark " + (q.complete ? "complete" : ""), children: q.complete ? "\u2713" : "\u25C7" }),
          /* @__PURE__ */ jsx16("strong", { children: q.name }),
          /* @__PURE__ */ jsxs14("small", { children: [
            "Lv.",
            q.level,
            " \xB7 ",
            q.complete ? "\u7B49\u5F85\u4EA4\u4ED8" : "\u8FDB\u884C\u4E2D"
          ] })
        ] }),
        /* @__PURE__ */ jsx16("p", { children: q.description }),
        /* @__PURE__ */ jsx16("div", { className: "objective-list", children: q.objectives.map((o, i) => /* @__PURE__ */ jsxs14("div", { children: [
          /* @__PURE__ */ jsxs14("span", { className: o.count >= o.required ? "done" : "", children: [
            o.name,
            " ",
            /* @__PURE__ */ jsxs14("b", { children: [
              o.count,
              "/",
              o.required
            ] })
          ] }),
          /* @__PURE__ */ jsx16("small", { children: o.locations.map((id) => d.map.find((n) => n.id === id)?.name).filter(Boolean).join("\u3001") })
        ] }, i)) }),
        /* @__PURE__ */ jsxs14("div", { className: "action-row", children: [
          navigationButton(q),
          /* @__PURE__ */ jsx16(Button, { variant: "ghost", disabled: busy, onClick: () => send({ type: "abandon", id: q.id }), children: "\u653E\u5F03\u4EFB\u52A1" })
        ] })
      ] }, q.id))
    ] })
  ] }) });
}

// lib/battle-scene.js
function unitBody(unit, scale) {
  const species = unit.visual?.species, type = unit.creatureType ?? unit.visual?.creatureType;
  const kind = unit.totemUnit ? "totem" : species === "spider" || species === "crab" ? "spider" : unit.form === "cat" || unit.form === "bear" || unit.kind === "beast" || type === 1 ? "beast" : type === 4 ? "elemental" : type === 2 ? "dragon" : type === 3 ? "demon" : type === 5 ? "giant" : type === 9 ? "mechanical" : "humanoid";
  const size = unit.rank === 3 ? 1.7 : kind === "giant" ? 1.5 : unit.rank === 1 ? 1.2 : unit.petUnit ? 0.8 : 1;
  const height = Math.max(28, Math.min(48, scale * 2.5)) * size;
  return { kind, height, width: height * (["beast", "spider", "dragon"].includes(kind) ? 1.25 : 0.78) };
}

// app/battle-figure.tsx
import { Fragment as Fragment5, jsx as jsx17, jsxs as jsxs15 } from "react/jsx-runtime";
var colors = { 1: "#ae9677", 2: "#df9cbd", 3: "#a2bd75", 4: "#ddcb75", 5: "#dbdad1", 7: "#6899c6", 8: "#85cbe2", 9: "#a193c9", 11: "#cb9266" };
function BattleFigure({ unit, scale, facing = 1 }) {
  const { kind } = unitBody(unit, scale), caster = [5, 7, 8, 9].includes(unit.classId) || /法师|招魂|巫师|术士/.test(unit.name || ""), color = colors[unit.classId] || (unit.foe ? "#aa7660" : "#8aa88a");
  if (unit.visual?.kind === "npc-model-render") return /* @__PURE__ */ jsxs15("svg", { className: "battle-miniature creature-miniature", viewBox: "0 0 64 72", "aria-hidden": "true", children: [
    /* @__PURE__ */ jsx17("ellipse", { cx: "32", cy: "66", rx: "19", ry: "5", fill: "#050a0c", opacity: ".6" }),
    /* @__PURE__ */ jsx17("ellipse", { className: "miniature-ring", cx: "32", cy: "66", rx: "22", ry: "5", fill: "none", stroke: unit.foe ? "#df927b" : "#90c7ae", strokeWidth: "1.5" }),
    /* @__PURE__ */ jsx17("g", { transform: facing < 0 ? "translate(64 0) scale(-1 1)" : void 0, children: /* @__PURE__ */ jsx17("image", { className: "miniature-body", href: unit.visual.src, x: "0", y: "0", width: "64", height: "66", preserveAspectRatio: "xMidYMax meet" }) })
  ] });
  return /* @__PURE__ */ jsxs15("svg", { className: "battle-miniature", viewBox: "0 0 64 72", preserveAspectRatio: "none", "aria-hidden": "true", style: { "--body-color": color }, children: [
    /* @__PURE__ */ jsx17("ellipse", { cx: "32", cy: "66", rx: "19", ry: "5", fill: "#050a0c", opacity: ".6" }),
    /* @__PURE__ */ jsx17("ellipse", { className: "miniature-ring", cx: "32", cy: "66", rx: "22", ry: "7", fill: "none", stroke: unit.foe ? "#df927b" : "#90c7ae", strokeWidth: "1.5" }),
    /* @__PURE__ */ jsx17("g", { transform: facing < 0 ? "translate(64 0) scale(-1 1)" : void 0, children: /* @__PURE__ */ jsx17("g", { className: "miniature-body", stroke: "#20272b", strokeWidth: "2", strokeLinejoin: "round", fill: "var(--body-color)", children: kind === "mechanical" ? /* @__PURE__ */ jsxs15(Fragment5, { children: [
      /* @__PURE__ */ jsx17("path", { d: "M21 48L18 64H28L30 48M36 48L38 64H48L44 48", fill: "#65717a" }),
      /* @__PURE__ */ jsx17("rect", { x: "17", y: "23", width: "30", height: "29", rx: "5", fill: "#8b9699" }),
      /* @__PURE__ */ jsx17("rect", { x: "22", y: "9", width: "20", height: "17", rx: "3", fill: "#aab3af" }),
      /* @__PURE__ */ jsx17("path", { d: "M26 17H38", stroke: "#f7d584", strokeWidth: "4" }),
      /* @__PURE__ */ jsx17("path", { d: "M16 29L8 34L9 49M48 29L55 35L54 49", stroke: "#8b9699", strokeWidth: "7" }),
      /* @__PURE__ */ jsx17("circle", { cx: "32", cy: "38", r: "7", fill: "#c0a46e" })
    ] }) : kind === "totem" ? /* @__PURE__ */ jsxs15(Fragment5, { children: [
      /* @__PURE__ */ jsx17("path", { d: "M23 63L25 24H39L41 63Z", fill: "#785d42" }),
      /* @__PURE__ */ jsx17("path", { d: "M18 28L32 17L46 28L32 38Z" }),
      /* @__PURE__ */ jsx17("path", { d: "M28 24L32 30L36 24", stroke: "#b2f0de" })
    ] }) : kind === "spider" ? /* @__PURE__ */ jsxs15(Fragment5, { children: [
      /* @__PURE__ */ jsx17("path", { d: "M24 44L10 32L3 49M24 50L7 47L2 61M40 44L54 32L61 49M40 50L57 47L62 61", fill: "none", stroke: "#b38b78", strokeWidth: "4" }),
      /* @__PURE__ */ jsx17("ellipse", { cx: "32", cy: "42", rx: "13", ry: "18" }),
      /* @__PURE__ */ jsx17("circle", { cx: "32", cy: "57", r: "9" }),
      /* @__PURE__ */ jsx17("path", { d: "M27 57H29M35 57H37", stroke: "#efbc74" })
    ] }) : kind === "beast" || kind === "dragon" ? /* @__PURE__ */ jsxs15(Fragment5, { children: [
      /* @__PURE__ */ jsx17("path", { d: "M12 44L7 30L2 25M16 49L13 63H20L25 48M39 49L40 63H47L46 47", fill: "#64584c" }),
      /* @__PURE__ */ jsx17("ellipse", { cx: "30", cy: "42", rx: "22", ry: "12" }),
      /* @__PURE__ */ jsx17("path", { d: "M42 40L43 24L49 30L56 28L55 43L62 47L56 53L43 48Z" }),
      /* @__PURE__ */ jsx17("path", { d: "M48 36H53", stroke: "#f4d89d" }),
      kind === "dragon" && /* @__PURE__ */ jsx17("path", { d: "M27 38L9 9L9 31L1 34L25 48M32 35L48 5L49 29L62 30L40 44", fill: "#927e68" })
    ] }) : kind === "elemental" ? /* @__PURE__ */ jsxs15(Fragment5, { children: [
      /* @__PURE__ */ jsx17("path", { d: "M19 64L26 53L15 43L22 24L32 9L44 28L49 46L37 56L44 64Z", fill: "#69a9b9" }),
      /* @__PURE__ */ jsx17("path", { d: "M27 32L33 22L37 41L27 49", fill: "#b6e5e5", stroke: "none" })
    ] }) : /* @__PURE__ */ jsxs15(Fragment5, { children: [
      /* @__PURE__ */ jsx17("path", { d: "M24 45L21 63H29L32 48L35 63H43L40 44", fill: "#555760" }),
      /* @__PURE__ */ jsx17("path", { d: caster ? "M25 26L19 60Q32 65 45 60L39 26Z" : "M23 27L20 46Q32 51 44 46L41 27Z" }),
      /* @__PURE__ */ jsx17("path", { d: "M23 28L16 31L14 46L20 49L25 36M41 28L48 32L49 45L43 48L39 35" }),
      /* @__PURE__ */ jsx17("path", { d: "M21 27L15 29L17 37L25 35M39 27L48 29L48 37L39 35", fill: "#909ca3" }),
      /* @__PURE__ */ jsx17("path", { d: "M25 12Q32 7 39 12L39 23L34 28H29L24 22Z", fill: "#c4a286" }),
      /* @__PURE__ */ jsx17("path", { d: caster ? "M22 17L32 3L42 18Z" : "M23 18L24 10L32 7L40 11L41 19L34 16L31 22L28 16Z", fill: caster ? color : "#819298" }),
      /* @__PURE__ */ jsx17("path", { d: "M28 21H30M34 21H36", stroke: "#30353b" }),
      caster ? /* @__PURE__ */ jsxs15(Fragment5, { children: [
        /* @__PURE__ */ jsx17("path", { d: "M50 63L52 17", stroke: "#a98e68", strokeWidth: "3" }),
        /* @__PURE__ */ jsx17("path", { d: "M52 9L57 16L52 23L47 16Z", fill: "#a9e4ec" })
      ] }) : /* @__PURE__ */ jsxs15(Fragment5, { children: [
        /* @__PURE__ */ jsx17("path", { d: "M49 47L49 19L53 15L56 20L53 47Z", fill: "#c5cfd3" }),
        /* @__PURE__ */ jsx17("path", { d: "M45 45H58", stroke: "#cfb17b", strokeWidth: "3" }),
        unit.classId !== 4 && /* @__PURE__ */ jsx17("path", { d: "M10 38L21 35L25 40L23 51L17 57L10 49Z", fill: "#788e9b" })
      ] }),
      kind === "demon" && /* @__PURE__ */ jsx17("path", { d: "M25 13L18 3L20 18M39 13L47 3L44 20", fill: "#aa7660" })
    ] }) }) })
  ] });
}
export {
  BattleFigure,
  PlayerHud as Hud,
  NpcConversation,
  NpcPortrait,
  World
};

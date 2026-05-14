/**
 * sheets/npc-sheet.mjs
 * Paragons NPC Sheet — ActorSheetV2 (Foundry V13)
 */

import { rollNpcAttack } from "../roll-helpers.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 }               = foundry.applications.sheets;

export class ParagonsNpcSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["paragons", "sheet", "actor", "npc"],
    position: { width: 640, height: 700 },
    window:   { resizable: true },
    tag: "form",
    form: {
      submitOnChange: true,
      closeOnSubmit:  false,
    },
  };

  static PARTS = {
    tabs: {
      id:       "tabs",
      template: "systems/paragons/templates/actor/npc-tabs.hbs",
    },
    main: {
      id:       "main",
      template: "systems/paragons/templates/actor/npc-main.hbs",
    },
    abilities: {
      id:         "abilities",
      template:   "systems/paragons/templates/actor/npc-abilities.hbs",
      scrollable: [".item-list"],
    },
    notes: {
      id:         "notes",
      template:   "systems/paragons/templates/actor/npc-notes.hbs",
      scrollable: [".notes-column"],
    },
  };

  static TABS = {
    main:      { id: "main",      group: "primary", label: "Stat Block",      initial: true  },
    abilities: { id: "abilities", group: "primary", label: "Abilities & Gear", initial: false },
    notes:     { id: "notes",     group: "primary", label: "Notes & Traits",   initial: false },
  };

  // ── Context ──────────────────────────────────

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const sys = this.actor.system;

    context.actor  = this.actor;
    context.system = sys;
    context.flags  = this.actor.flags;

    context.stats = [
      { key: "physique", label: "Physique", value: sys.stats.physique },
      { key: "finesse",  label: "Finesse",  value: sys.stats.finesse  },
      { key: "stamina",  label: "Stamina",  value: sys.stats.stamina  },
      { key: "acuity",   label: "Acuity",   value: sys.stats.acuity   },
      { key: "presence", label: "Presence", value: sys.stats.presence  },
    ];

    context.statChoices = [
      { value: "physique", label: "Physique" },
      { value: "finesse",  label: "Finesse"  },
      { value: "stamina",  label: "Stamina"  },
      { value: "acuity",   label: "Acuity"   },
      { value: "presence", label: "Presence" },
    ];

    context.npcTypeChoices = ["antagonist","creature","hero","villain"].map(t => ({
      value: t, label: t.charAt(0).toUpperCase() + t.slice(1),
      selected: sys.npcType === t,
    }));

    context.prGuidelines      = sys.powerRatingGuidelines;
    context.powerRatingLabel  = _prLabel(sys.powerRating);
    context.statTotal         = sys.statTotal;
    context.statOverCap       = sys.statTotal > sys.powerRatingGuidelines.maxStatTotal;
    context.willResistTotal   = sys.willResistTotal;
    context.willResistOverCap = sys.willResistTotal > sys.powerRatingGuidelines.maxWillResistTotal;

    context.abilities     = this.actor.items.filter(i => i.type === "ability").sort((a,b) => a.name.localeCompare(b.name));
    context.gear          = this.actor.items.filter(i => i.type === "gear").sort((a,b) => a.name.localeCompare(b.name));
    context.abilityGearTotal = context.abilities.length + context.gear.length;
    context.tabs = this._getTabs(this.constructor.TABS);

    return context;
  }

  // ── Tab Helper ───────────────────────────────
  _getTabs(tabs) {
    for (const v of Object.values(tabs)) {
      v.active   = this.tabGroups[v.group] === v.id || (v.initial && !this.tabGroups[v.group]);
      v.cssClass = v.active ? "active" : "";
    }
    return tabs;
  }

  // ── Part Listeners ────────────────────────────

  _attachPartListeners(partId, htmlElement, options) {
    super._attachPartListeners(partId, htmlElement, options);

    if (partId === "main")      this._attachMainListeners(htmlElement);
    if (partId === "abilities") this._attachAbilityListeners(htmlElement);
  }

  _attachMainListeners(html) {
    html.querySelectorAll(".roll-attack-btn").forEach(el => {
      el.addEventListener("click", async (event) => {
        const move = this.actor.system.attackMoves[parseInt(el.dataset.index)];
        if (move) await rollNpcAttack(this.actor, move, event);
      });
    });

    html.querySelector(".add-attack-btn")?.addEventListener("click", async () => {
      const moves = foundry.utils.deepClone(this.actor.system.attackMoves ?? []);
      moves.push({ label: "New Attack", stat: "physique", dicePool: 4, range: "near", description: "" });
      await this.actor.update({ "system.attackMoves": moves });
    });

    html.querySelectorAll(".delete-attack-btn").forEach(el => {
      el.addEventListener("click", async () => {
        const moves = foundry.utils.deepClone(this.actor.system.attackMoves ?? []);
        moves.splice(parseInt(el.dataset.index), 1);
        await this.actor.update({ "system.attackMoves": moves });
      });
    });
  }

  _attachAbilityListeners(html) {
    html.querySelectorAll("[data-action='itemCreate']").forEach(el => {
      el.addEventListener("click", async () => {
        const type = el.dataset.type;
        const defaults = {
          ability: { name: "New Ability", type: "ability", system: { abilityLevel: 1 } },
          gear:    { name: "New Gear",    type: "gear",    system: { gearDice: 2 } },
        };
        const data = defaults[type];
        if (!data) return;
        const [item] = await this.actor.createEmbeddedDocuments("Item", [data]);
        item?.sheet.render({ force: true });
      });
    });

    html.querySelectorAll("[data-action='itemEdit']").forEach(el => {
      el.addEventListener("click", (event) => {
        event.stopPropagation();
        this.actor.items.get(el.dataset.itemId)?.sheet.render({ force: true });
      });
    });

    html.querySelectorAll("[data-action='itemDelete']").forEach(el => {
      el.addEventListener("click", async (event) => {
        event.stopPropagation();
        const item = this.actor.items.get(el.dataset.itemId);
        if (!item) return;
        const confirmed = await foundry.applications.api.DialogV2.confirm({
          window: { title: `Delete ${item.name}?` },
          content: `<p>Remove <strong>${item.name}</strong>?</p>`,
        });
        if (confirmed) await item.delete();
      });
    });
  }
}

function _prLabel(pr) {
  return [
    "Not a threat", "Level 1 equivalent", "Level 2 equivalent",
    "Level 3 equivalent", "Level 4 equivalent", "Level 5 equivalent",
    "Level 6 equivalent", "Above any individual paragon",
  ][pr] ?? "Unknown";
}

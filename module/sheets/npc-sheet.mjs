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
    form: {
      submitOnChange: true,
      closeOnSubmit:  false,
    },
    actions: {
      rollAttack:   ParagonsNpcSheet.#rollAttack,
      addAttack:    ParagonsNpcSheet.#addAttack,
      deleteAttack: ParagonsNpcSheet.#deleteAttack,
      itemCreate:   ParagonsNpcSheet.#itemCreate,
      itemEdit:     ParagonsNpcSheet.#itemEdit,
      itemDelete:   ParagonsNpcSheet.#itemDelete,
    },
  };

  static TABS = {
    sheet: {
      tabs: [
        { id: "main",      group: "sheet", label: "Stat Block"       },
        { id: "abilities", group: "sheet", label: "Abilities & Gear"  },
        { id: "notes",     group: "sheet", label: "Notes & Traits"    },
      ],
      initial: "main",
    },
  };

  static PARTS = {
    tabs: {
      template: "systems/paragons/templates/actor/npc-tabs.hbs",
    },
    main: {
      template: "systems/paragons/templates/actor/npc-main.hbs",
    },
    abilities: {
      template: "systems/paragons/templates/actor/npc-abilities.hbs",
      scrollable: [".item-list"],
    },
    notes: {
      template: "systems/paragons/templates/actor/npc-notes.hbs",
      scrollable: [".notes-column"],
    },
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

    context.abilities = this.actor.items.filter(i => i.type === "ability").sort((a,b) => a.name.localeCompare(b.name));
    context.gear      = this.actor.items.filter(i => i.type === "gear").sort((a,b) => a.name.localeCompare(b.name));
    context.abilityGearTotal = context.abilities.length + context.gear.length;

    return context;
  }

  // ── Actions ──────────────────────────────────

  static async #rollAttack(_event, target) {
    const index = parseInt(target.dataset.index);
    const move  = this.actor.system.attackMoves[index];
    if (move) await rollNpcAttack(this.actor, move, _event);
  }

  static async #addAttack() {
    const moves = foundry.utils.deepClone(this.actor.system.attackMoves ?? []);
    moves.push({ label: "New Attack", stat: "physique", dicePool: 4, range: "near", description: "" });
    await this.actor.update({ "system.attackMoves": moves });
  }

  static async #deleteAttack(_event, target) {
    const moves = foundry.utils.deepClone(this.actor.system.attackMoves ?? []);
    moves.splice(parseInt(target.dataset.index), 1);
    await this.actor.update({ "system.attackMoves": moves });
  }

  static async #itemCreate(_event, target) {
    const type = target.dataset.type;
    const defaults = {
      ability: { name: "New Ability", type: "ability", system: { abilityLevel: 1 } },
      gear:    { name: "New Gear",    type: "gear",    system: { gearDice: 2 } },
    };
    const data = defaults[type];
    if (!data) return;
    const [item] = await this.actor.createEmbeddedDocuments("Item", [data]);
    item?.sheet.render({ force: true });
  }

  static async #itemEdit(_event, target) {
    this.actor.items.get(target.dataset.itemId)?.sheet.render({ force: true });
  }

  static async #itemDelete(_event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (!item) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: `Delete ${item.name}?` },
      content: `<p>Remove <strong>${item.name}</strong>?</p>`,
    });
    if (confirmed) await item.delete();
  }
}

function _prLabel(pr) {
  return [
    "Not a threat", "Level 1 equivalent", "Level 2 equivalent",
    "Level 3 equivalent", "Level 4 equivalent", "Level 5 equivalent",
    "Level 6 equivalent", "Above any individual paragon",
  ][pr] ?? "Unknown";
}

/**
 * sheets/npc-sheet.mjs
 * Paragons NPC Sheet — ActorSheet subclass
 */

import { rollNpcAttack } from "../roll-helpers.mjs";

export class ParagonsNpcSheet extends ActorSheet {

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes:   ["paragons", "sheet", "actor", "npc"],
      template:  "systems/paragons/templates/actor/npc-sheet.hbs",
      width:     640,
      height:    700,
      tabs: [{
        navSelector:     ".sheet-tabs",
        contentSelector: ".tab-content",
        initial:         "main",
      }],
      dragDrop: [{ dragSelector: ".item-row", dropSelector: ".sheet" }],
    });
  }

  // ─────────────────────────────────────────────
  //  getData
  // ─────────────────────────────────────────────
  async getData(options = {}) {
    const context = await super.getData(options);
    const system  = this.actor.system;

    // ── Stats ─────────────────────────────────
    context.stats = [
      { key: "physique", label: "Physique", value: system.stats.physique },
      { key: "finesse",  label: "Finesse",  value: system.stats.finesse  },
      { key: "stamina",  label: "Stamina",  value: system.stats.stamina  },
      { key: "acuity",   label: "Acuity",   value: system.stats.acuity   },
      { key: "presence", label: "Presence", value: system.stats.presence  },
    ];

    // Stat choices for attack move dropdowns
    context.statChoices = [
      { value: "physique", label: "Physique" },
      { value: "finesse",  label: "Finesse"  },
      { value: "stamina",  label: "Stamina"  },
      { value: "acuity",   label: "Acuity"   },
      { value: "presence", label: "Presence" },
    ];

    // ── NPC Type choices ──────────────────────
    context.npcTypeChoices = [
      "antagonist", "creature", "hero", "villain"
    ].map(t => ({
      value:    t,
      label:    t.charAt(0).toUpperCase() + t.slice(1),
      selected: system.npcType === t,
    }));

    // ── Power Rating ──────────────────────────
    context.prGuidelines      = system.powerRatingGuidelines;
    context.powerRatingLabel  = _powerRatingLabel(system.powerRating);
    context.statTotal         = system.statTotal;
    context.statOverCap       = system.statTotal > system.powerRatingGuidelines.maxStatTotal;
    context.willResistTotal   = system.willResistTotal;
    context.willResistOverCap = system.willResistTotal > system.powerRatingGuidelines.maxWillResistTotal;

    // ── Items ─────────────────────────────────
    context.abilities = this.actor.items
      .filter(i => i.type === "ability")
      .sort((a, b) => a.name.localeCompare(b.name));

    context.gear = this.actor.items
      .filter(i => i.type === "gear")
      .sort((a, b) => a.name.localeCompare(b.name));

    // Ability + Gear total for cap check
    context.abilityGearTotal = context.abilities.length + context.gear.length;

    // Active tab
    context.activeTab = this._tabs[0]?.active ?? "main";

    return context;
  }

  // ─────────────────────────────────────────────
  //  activateListeners
  // ─────────────────────────────────────────────
  activateListeners(html) {
    super.activateListeners(html);

    // ── Roll attack move ──────────────────────
    html.find(".roll-attack-btn").on("click", async (event) => {
      event.stopPropagation();
      const index = parseInt(event.currentTarget.dataset.index);
      const attackMove = this.actor.system.attackMoves[index];
      if (!attackMove) return;
      await rollNpcAttack(this.actor, attackMove, event);
    });

    // ── Add attack move ───────────────────────
    html.find(".add-attack-btn").on("click", async () => {
      const moves = foundry.utils.deepClone(this.actor.system.attackMoves ?? []);
      moves.push({
        label:    "New Attack",
        stat:     "physique",
        dicePool: 4,
        range:    "near",
        description: "",
      });
      await this.actor.update({ "system.attackMoves": moves });
    });

    // ── Delete attack move ────────────────────
    html.find(".delete-attack-btn").on("click", async (event) => {
      event.stopPropagation();
      const index = parseInt(event.currentTarget.dataset.index);
      const moves = foundry.utils.deepClone(this.actor.system.attackMoves ?? []);
      moves.splice(index, 1);
      await this.actor.update({ "system.attackMoves": moves });
    });

    // ── Item create ───────────────────────────
    html.find(".item-create-btn[data-type]").on("click", (event) => {
      const type = event.currentTarget.dataset.type;
      if (type) this._onItemCreate(type);
    });

    // ── Item edit ─────────────────────────────
    html.find(".item-edit").on("click", (event) => {
      event.stopPropagation();
      const item = this.actor.items.get(event.currentTarget.dataset.itemId);
      item?.sheet.render(true);
    });

    // ── Item delete ───────────────────────────
    html.find(".item-delete").on("click", async (event) => {
      event.stopPropagation();
      const item = this.actor.items.get(event.currentTarget.dataset.itemId);
      if (!item) return;
      const confirm = await Dialog.confirm({
        title:   `Delete ${item.name}?`,
        content: `<p>Remove <strong>${item.name}</strong>?</p>`,
      });
      if (confirm) await item.delete();
    });

    // ── Power Rating change → auto-update dicePoolMax ────────────────────
    html.find('[name="system.powerRating"]').on("change", async (event) => {
      const pr    = parseInt(event.target.value) || 0;
      const table = [4, 8, 10, 12, 15, 20, 25, 30];
      const poolMax = table[Math.min(pr, 7)] ?? 8;
      // Update the dice pool max field to the default for this PR
      html.find('[name="system.dicePoolMax"]').val(poolMax);
    });
  }

  // ─────────────────────────────────────────────
  //  _onItemCreate
  // ─────────────────────────────────────────────
  async _onItemCreate(type) {
    const defaults = {
      ability: { name: "New Ability", type: "ability", system: { abilityLevel: 1 } },
      gear:    { name: "New Gear",    type: "gear",    system: { gearDice: 2 } },
    };
    const data = defaults[type];
    if (!data) return;
    const [item] = await this.actor.createEmbeddedDocuments("Item", [data]);
    item?.sheet.render(true);
  }
}

// ─────────────────────────────────────────────
//  Helper
// ─────────────────────────────────────────────
function _powerRatingLabel(pr) {
  const labels = [
    "Not a threat",
    "Level 1 equivalent",
    "Level 2 equivalent",
    "Level 3 equivalent",
    "Level 4 equivalent",
    "Level 5 equivalent",
    "Level 6 equivalent",
    "Above any individual paragon",
  ];
  return labels[pr] ?? "Unknown";
}

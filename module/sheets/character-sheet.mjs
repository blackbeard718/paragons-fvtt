/**
 * sheets/character-sheet.mjs
 * Paragons Character Sheet — ActorSheet subclass
 */

import {
  rollStat, rollAttack, rollResist,
  rollDeath, rollMove
} from "../roll-helpers.mjs";

export class ParagonsCharacterSheet extends ActorSheet {

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes:   ["paragons", "sheet", "actor", "character"],
      template:  "systems/paragons/templates/actor/character-sheet.hbs",
      width:     740,
      height:    860,
      tabs: [{
        navSelector:     ".sheet-tabs",
        contentSelector: ".tab-content",
        initial:         "play",
      }],
      dragDrop: [{ dragSelector: ".item-row", dropSelector: ".sheet" }],
    });
  }

  // ─────────────────────────────────────────────
  //  getData — builds template context
  // ─────────────────────────────────────────────
  async getData(options = {}) {
    const context = await super.getData(options);
    const system  = this.actor.system;

    // ── Stats array for template iteration ────
    context.stats = [
      { key: "physique", label: "Physique", value: system.stats.physique },
      { key: "finesse",  label: "Finesse",  value: system.stats.finesse  },
      { key: "stamina",  label: "Stamina",  value: system.stats.stamina  },
      { key: "acuity",   label: "Acuity",   value: system.stats.acuity   },
      { key: "presence", label: "Presence", value: system.stats.presence  },
    ];

    // ── Archetype select options ───────────────
    context.archetypeChoices = [
      "acrobat","brawler","commander","defender",
      "facilitator","hunter","strategist","striker"
    ].map(a => ({
      value:    a,
      label:    a.charAt(0).toUpperCase() + a.slice(1),
      selected: system.archetype === a,
    }));

    // ── Items sorted by type ───────────────────
    context.abilities = this.actor.items
      .filter(i => i.type === "ability")
      .sort((a, b) => a.system.abilityLevel - b.system.abilityLevel
                   || a.name.localeCompare(b.name));

    context.talents = this.actor.items
      .filter(i => i.type === "talent")
      .sort((a, b) => a.system.talentLevel - b.system.talentLevel
                   || a.name.localeCompare(b.name));

    context.gear = this.actor.items
      .filter(i => i.type === "gear")
      .sort((a, b) => a.name.localeCompare(b.name));

    // ── Reputation ────────────────────────────
    const TIER_LABELS = ["Villain","Bad","Poor","Neutral","Positive","Good","Paragon"];
    const currentTier = system.reputation.tier;

    context.reputationTiers = TIER_LABELS.map((label, index) => ({
      label,
      index,
      current: index === currentTier,
      active:  index <= currentTier,
    }));

    context.reputationThreshold = system.reputationThresholds;

    // ── Moves reference data ──────────────────
    context.moves = _buildMovesData();

    // ── Active tab (for template conditional) ─
    context.activeTab = this._tabs[0]?.active ?? "play";

    return context;
  }

  // ─────────────────────────────────────────────
  //  activateListeners — wire up all interactivity
  // ─────────────────────────────────────────────
  activateListeners(html) {
    super.activateListeners(html);

    // ── Stat rolls (click any stat block) ─────
    html.find(".stat-block").on("click", async (event) => {
      const statKey = event.currentTarget.dataset.stat;
      await rollStat(this.actor, statKey, event);
    });

    // ── Move roll buttons (Concept/Moves tab) ─
    html.find(".move-roll-btn").on("click", async (event) => {
      event.stopPropagation();
      const btn   = event.currentTarget;
      const stat  = btn.dataset.stat;
      const label = btn.dataset.label;
      await rollMove(this.actor, { statKey: stat, label, event });
    });

    // ── Item create ───────────────────────────
    html.find(".item-create-btn").on("click", (event) => {
      const type = event.currentTarget.dataset.type;
      this._onItemCreate(type);
    });

    // ── Item edit ─────────────────────────────
    html.find(".item-edit").on("click", (event) => {
      event.stopPropagation();
      const id   = event.currentTarget.dataset.itemId;
      const item = this.actor.items.get(id);
      item?.sheet.render(true);
    });

    // ── Item delete ───────────────────────────
    html.find(".item-delete").on("click", async (event) => {
      event.stopPropagation();
      const id   = event.currentTarget.dataset.itemId;
      const item = this.actor.items.get(id);
      if (!item) return;

      const confirm = await Dialog.confirm({
        title:   `Delete ${item.name}?`,
        content: `<p>Remove <strong>${item.name}</strong> from this character?</p>`,
      });
      if (confirm) await item.delete();
    });

    // ── Gear equip toggle ─────────────────────
    html.find(".item-equip-toggle").on("click", async (event) => {
      event.stopPropagation();
      const id   = event.currentTarget.dataset.itemId;
      const item = this.actor.items.get(id);
      if (!item) return;
      await item.update({ "system.equipped": !item.system.equipped });
    });

    // ── Ability use (decrement uses) ──────────
    html.find(".use-ability-btn").on("click", async (event) => {
      event.stopPropagation();
      const id   = event.currentTarget.dataset.itemId;
      const item = this.actor.items.get(id);
      if (!item || !item.system.hasUses) return;

      if (item.system.isExhausted) {
        ui.notifications.warn(`${item.name} has no uses remaining.`);
        return;
      }
      await item.update({
        "system.uses.current": item.system.uses.current - 1
      });
    });

    // ── Reputation tier click ─────────────────
    html.find(".rep-tier").on("click", async (event) => {
      const tier = parseInt(event.currentTarget.dataset.tier);
      await this.actor.update({ "system.reputation.tier": tier });
    });

    // ── Death roll button (if visible) ────────
    html.find(".death-roll-btn").on("click", async (event) => {
      const { rollDeath } = await import("../roll-helpers.mjs");
      await rollDeath(this.actor, event);
    });
  }

  // ─────────────────────────────────────────────
  //  _onItemCreate — create a blank item of type
  // ─────────────────────────────────────────────
  async _onItemCreate(type) {
    const defaults = {
      ability: { name: "New Ability", type: "ability", system: { abilityLevel: 1 } },
      talent:  { name: "New Talent",  type: "talent",
                 system: { archetype: this.actor.system.archetype || "", talentLevel: 1 } },
      gear:    { name: "New Gear",    type: "gear",   system: { gearDice: 2 } },
    };

    const data = defaults[type];
    if (!data) return;

    const [item] = await this.actor.createEmbeddedDocuments("Item", [data]);
    item?.sheet.render(true);
  }

  // ─────────────────────────────────────────────
  //  Form submission — persist all field changes
  // ─────────────────────────────────────────────
  async _updateObject(event, formData) {
    return this.actor.update(formData);
  }

  // ─────────────────────────────────────────────
  //  Drag & Drop
  // ─────────────────────────────────────────────
  _onDragStart(event) {
    const row    = event.currentTarget;
    const itemId = row.dataset.itemId;
    if (!itemId) return super._onDragStart(event);

    const item = this.actor.items.get(itemId);
    if (!item) return;

    event.dataTransfer.setData("text/plain", JSON.stringify({
      type:   "Item",
      uuid:   item.uuid,
    }));
  }

  async _onDrop(event) {
    // Let Foundry handle compendium/world item drops
    return super._onDrop(event);
  }
}

// ─────────────────────────────────────────────
//  Moves reference data
//  Used in the Concept/Moves tab — static content.
// ─────────────────────────────────────────────
function _buildMovesData() {
  return [
    {
      key:         "aidFallen",
      name:        "Aid the Fallen",
      description: "Spend your turn helping someone with 0 Will and Resist. They regain 1 Will.",
      rollable:    false,
    },
    {
      key:         "attack",
      name:        "Attack",
      description: "Strike at your opponent using Physique (power/melee) or Finesse (ranged/precision).",
      rollable:    true,
      stat:        "physique",
      statLabel:   "Physique or Finesse",
    },
    {
      key:         "defend",
      name:        "Defend",
      description: "Make a Physique or Acuity roll. Before your next turn, ignore damage equal to successes.",
      rollable:    true,
      stat:        "physique",
      statLabel:   "Physique or Acuity",
    },
    {
      key:         "help",
      name:        "Help",
      description: "Aid an ally. When they roll on the same turn, they add 2d6 to their pool.",
      rollable:    false,
    },
    {
      key:         "hide",
      name:        "Hide",
      description: "Opposed move vs. Observe/Understand. Finesse to avoid detection; Presence to lie.",
      rollable:    true,
      stat:        "finesse",
      statLabel:   "Finesse or Presence",
    },
    {
      key:         "interact",
      name:        "Interact",
      description: "Lift an object, use technology, or engage surroundings. GM decides if a roll is needed.",
      rollable:    false,
    },
    {
      key:         "manipulate",
      name:        "Manipulate",
      description: "Make a Presence roll opposed by Resist Acuity or Presence.",
      rollable:    true,
      stat:        "presence",
      statLabel:   "Presence",
    },
    {
      key:         "move",
      name:        "Move",
      description: "Take a new position using your Movement. GM may call for a roll to pass obstacles.",
      rollable:    false,
    },
    {
      key:         "observe",
      name:        "Observe",
      description: "Make a Presence roll. On a success, learn something about your situation or environment.",
      rollable:    true,
      stat:        "presence",
      statLabel:   "Presence",
    },
    {
      key:         "persuade",
      name:        "Persuade",
      description: "Make a Presence roll to convince someone to listen to you.",
      rollable:    true,
      stat:        "presence",
      statLabel:   "Presence",
    },
    {
      key:         "recallResearch",
      name:        "Recall / Research",
      description: "Make an Acuity roll to recall or uncover information.",
      rollable:    true,
      stat:        "acuity",
      statLabel:   "Acuity",
    },
    {
      key:         "train",
      name:        "Train",
      description: "Montage scenes only. Make a Stamina roll to accumulate successes toward improving an ability.",
      rollable:    true,
      stat:        "stamina",
      statLabel:   "Stamina",
    },
    {
      key:         "understand",
      name:        "Understand",
      description: "Make an Acuity roll. On a success, realize something previously missed.",
      rollable:    true,
      stat:        "acuity",
      statLabel:   "Acuity",
    },
    {
      key:         "useAbility",
      name:        "Use an Ability",
      description: "Use one of your abilities. No roll required unless the ability calls for one.",
      rollable:    false,
    },
  ];
}

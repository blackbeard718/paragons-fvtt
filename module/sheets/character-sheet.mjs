/**
 * sheets/character-sheet.mjs
 * Paragons Character Sheet — ActorSheetV2 (Foundry V13)
 */

import { rollStat, rollMove, rollDeath } from "../roll-helpers.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 }               = foundry.applications.sheets;

export class ParagonsCharacterSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["paragons", "sheet", "actor", "character"],
    position: { width: 740, height: 860 },
    window:   { resizable: true },
    tag: "form",
    form: {
      submitOnChange: true,
      closeOnSubmit:  false,
    },
  };

  // Actions defined after class body to avoid private field init order issues
  static _actions = {
    rollStat:        ParagonsCharacterSheet._rollStat,
    rollMove:        ParagonsCharacterSheet._rollMove,
    rollDeath:       ParagonsCharacterSheet._rollDeath,
    itemCreate:      ParagonsCharacterSheet._itemCreate,
    itemEdit:        ParagonsCharacterSheet._itemEdit,
    itemDelete:      ParagonsCharacterSheet._itemDelete,
    itemEquipToggle: ParagonsCharacterSheet._itemEquipToggle,
    useAbility:      ParagonsCharacterSheet._useAbility,
    repTierSet:      ParagonsCharacterSheet._repTierSet,
  };

  static TABS = {
    sheet: {
      tabs: [
        { id: "play",    group: "sheet", label: "Play Sheet"      },
        { id: "concept", group: "sheet", label: "Concept & Moves" },
      ],
      initial: "play",
    },
  };

  static PARTS = {
    tabs: {
      template: "systems/paragons/templates/actor/character-tabs.hbs",
    },
    play: {
      template:   "systems/paragons/templates/actor/character-play.hbs",
      scrollable: [".abilities-list", ".talents-list", ".gear-list"],
    },
    concept: {
      template:   "systems/paragons/templates/actor/character-concept.hbs",
      scrollable: [".concept-column"],
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

    context.archetypeChoices = [
      "acrobat","brawler","commander","defender",
      "facilitator","hunter","strategist","striker",
    ].map(a => ({
      value: a, label: a.charAt(0).toUpperCase() + a.slice(1),
      selected: sys.archetype === a,
    }));

    context.abilities = this.actor.items
      .filter(i => i.type === "ability")
      .sort((a,b) => a.system.abilityLevel - b.system.abilityLevel || a.name.localeCompare(b.name));

    context.talents = this.actor.items
      .filter(i => i.type === "talent")
      .sort((a,b) => a.system.talentLevel - b.system.talentLevel || a.name.localeCompare(b.name));

    context.gear = this.actor.items
      .filter(i => i.type === "gear")
      .sort((a,b) => a.name.localeCompare(b.name));

    const TIER_LABELS = ["Villain","Bad","Poor","Neutral","Positive","Good","Paragon"];
    context.reputationTiers = TIER_LABELS.map((label, index) => ({
      label, index,
      current: index === sys.reputation.tier,
      active:  index <= sys.reputation.tier,
    }));
    context.reputationThreshold = sys.reputationThresholds ?? { featsNeeded: null, failuresNeeded: null };
    context.moves = _buildMovesData();

    return context;
  }

  // ── Render ───────────────────────────────────

  _onRender(context, options) {
    super._onRender(context, options);
    // Mark item rows as draggable for ActorSheetV2 built-in handling
    this.element.querySelectorAll(".item-row[data-item-id]").forEach(el => {
      el.setAttribute("draggable", "true");
    });
  }

  // ── Actions ──────────────────────────────────

  static async _rollStat(event, target) {
    await rollStat(this.actor, target.dataset.stat, event);
  }

  static async _rollMove(event, target) {
    await rollMove(this.actor, { statKey: target.dataset.stat, label: target.dataset.label, event });
  }

  static async _rollDeath(event, _target) {
    await rollDeath(this.actor, event);
  }

  static async _itemCreate(_event, target) {
    const type = target.dataset.type;
    const defaults = {
      ability: { name: "New Ability", type: "ability", system: { abilityLevel: 1 } },
      talent:  { name: "New Talent",  type: "talent",  system: { archetype: this.actor.system.archetype || "", talentLevel: 1 } },
      gear:    { name: "New Gear",    type: "gear",    system: { gearDice: 2 } },
    };
    const data = defaults[type];
    if (!data) return;
    const [item] = await this.actor.createEmbeddedDocuments("Item", [data]);
    item?.sheet.render({ force: true });
  }

  static async _itemEdit(_event, target) {
    this.actor.items.get(target.dataset.itemId)?.sheet.render({ force: true });
  }

  static async _itemDelete(_event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (!item) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: `Delete ${item.name}?` },
      content: `<p>Remove <strong>${item.name}</strong>?</p>`,
    });
    if (confirmed) await item.delete();
  }

  static async _itemEquipToggle(_event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (item) await item.update({ "system.equipped": !item.system.equipped });
  }

  static async _useAbility(_event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (!item?.system.hasUses) return;
    if (item.system.isExhausted) { ui.notifications.warn(`${item.name} has no uses remaining.`); return; }
    await item.update({ "system.uses.current": item.system.uses.current - 1 });
  }

  static async _repTierSet(_event, target) {
    await this.actor.update({ "system.reputation.tier": parseInt(target.dataset.tier) });
  }
}

function _buildMovesData() {
  return [
    { key: "aidFallen",  name: "Aid the Fallen",   description: "Spend your turn helping someone with 0 Will and Resist. They regain 1 Will.", rollable: false },
    { key: "attack",     name: "Attack",            description: "Strike using Physique (melee/power) or Finesse (ranged/precision).", rollable: true,  stat: "physique", statLabel: "Physique or Finesse" },
    { key: "defend",     name: "Defend",            description: "Make a Physique or Acuity roll. Before your next turn, ignore damage equal to successes.", rollable: true, stat: "physique", statLabel: "Physique or Acuity" },
    { key: "help",       name: "Help",              description: "Aid an ally. When they roll on the same turn, they add 2d6 to their pool.", rollable: false },
    { key: "hide",       name: "Hide",              description: "Opposed vs. Observe/Understand. Finesse to avoid detection; Presence to lie.", rollable: true, stat: "finesse", statLabel: "Finesse or Presence" },
    { key: "interact",   name: "Interact",          description: "Lift an object, use technology, or engage surroundings.", rollable: false },
    { key: "manipulate", name: "Manipulate",        description: "Presence roll opposed by Resist Acuity or Presence.", rollable: true, stat: "presence", statLabel: "Presence" },
    { key: "move",       name: "Move",              description: "Take a new position using your Movement.", rollable: false },
    { key: "observe",    name: "Observe",           description: "Presence roll. On a success, learn something about your situation or environment.", rollable: true, stat: "presence", statLabel: "Presence" },
    { key: "persuade",   name: "Persuade",          description: "Presence roll to convince someone to listen to you.", rollable: true, stat: "presence", statLabel: "Presence" },
    { key: "recall",     name: "Recall / Research", description: "Acuity roll to recall or uncover information.", rollable: true, stat: "acuity", statLabel: "Acuity" },
    { key: "train",      name: "Train",             description: "Montage scenes only. Stamina roll to improve an ability.", rollable: true, stat: "stamina", statLabel: "Stamina" },
    { key: "understand", name: "Understand",        description: "Acuity roll. On success, realize something previously missed.", rollable: true, stat: "acuity", statLabel: "Acuity" },
    { key: "useAbility", name: "Use an Ability",    description: "No roll required unless the ability calls for one.", rollable: false },
  ];
}

// Merge actions into DEFAULT_OPTIONS after class is fully defined
ParagonsCharacterSheet.DEFAULT_OPTIONS.actions = ParagonsCharacterSheet._actions;

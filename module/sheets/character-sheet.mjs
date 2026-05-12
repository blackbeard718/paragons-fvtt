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

  static PARTS = {
    header: {
      id:       "header",
      template: "systems/paragons/templates/actor/character-header.hbs",
    },
    tabs: {
      id:       "tabs",
      template: "systems/paragons/templates/actor/character-tabs.hbs",
    },
    play: {
      id:         "play",
      template:   "systems/paragons/templates/actor/character-play.hbs",
      scrollable: [".abilities-list", ".talents-list", ".gear-list"],
    },
    concept: {
      id:         "concept",
      template:   "systems/paragons/templates/actor/character-concept.hbs",
      scrollable: [".concept-column"],
    },
  };

  static TABS = {
    primary: {
      tabs:    [{ id: "play" }, { id: "concept" }],
      initial: "play",
      labelPrefix: "PARAGONS.Tabs",
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

  // ── Part Listeners (V13 pattern) ─────────────

  _attachPartListeners(partId, htmlElement, options) {
    super._attachPartListeners(partId, htmlElement, options);

    switch (partId) {
      case "play":
        this._attachPlayListeners(htmlElement);
        break;
      case "concept":
        this._attachConceptListeners(htmlElement);
        break;
    }
  }

  _attachPlayListeners(html) {
    // Stat clicks → roll (skip if clicking the input itself)
    html.querySelectorAll(".stat-block").forEach(el => {
      el.addEventListener("click", async (event) => {
        if (event.target.tagName === "INPUT") return;
        await rollStat(this.actor, el.dataset.stat, event);
      });
    });

    // Item create
    html.querySelectorAll("[data-action='itemCreate']").forEach(el => {
      el.addEventListener("click", async (event) => {
        event.preventDefault();
        await this._onItemCreate(el.dataset.type);
      });
    });

    // Item edit
    html.querySelectorAll("[data-action='itemEdit']").forEach(el => {
      el.addEventListener("click", async (event) => {
        event.stopPropagation();
        this.actor.items.get(el.dataset.itemId)?.sheet.render({ force: true });
      });
    });

    // Item delete
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

    // Gear equip toggle
    html.querySelectorAll("[data-action='itemEquipToggle']").forEach(el => {
      el.addEventListener("click", async (event) => {
        event.stopPropagation();
        const item = this.actor.items.get(el.dataset.itemId);
        if (item) await item.update({ "system.equipped": !item.system.equipped });
      });
    });

    // Use ability
    html.querySelectorAll("[data-action='useAbility']").forEach(el => {
      el.addEventListener("click", async (event) => {
        event.stopPropagation();
        const item = this.actor.items.get(el.dataset.itemId);
        if (!item?.system.hasUses) return;
        if (item.system.isExhausted) { ui.notifications.warn(`${item.name} has no uses remaining.`); return; }
        await item.update({ "system.uses.current": item.system.uses.current - 1 });
      });
    });

    // Reputation tier
    html.querySelectorAll(".rep-tier").forEach(el => {
      el.addEventListener("click", async () => {
        await this.actor.update({ "system.reputation.tier": parseInt(el.dataset.tier) });
      });
    });
  }

  _attachConceptListeners(html) {
    // Move roll buttons
    html.querySelectorAll(".move-roll-btn").forEach(el => {
      el.addEventListener("click", async (event) => {
        event.preventDefault();
        await rollMove(this.actor, {
          statKey: el.dataset.stat,
          label:   el.dataset.label,
          event,
        });
      });
    });
  }

  // ── Item Create Helper ────────────────────────

  async _onItemCreate(type) {
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
}

// ── Add lang keys for tabs ────────────────────
// V13 labelPrefix + tab id = localization key
// PARAGONS.Tabs.play, PARAGONS.Tabs.concept

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

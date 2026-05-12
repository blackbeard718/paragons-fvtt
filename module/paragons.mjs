/**
 * paragons.mjs — Main entry point for Paragons: The Roleplaying Game
 * Loaded via esmodules in system.json
 */

import { CharacterData } from "./actor/character-data.mjs";
import { NpcData }        from "./actor/npc-data.mjs";
import { AbilityData, TalentData, GearData } from "./item/item-data.mjs";
import { ParagonsRoll, ParagonsRollDialog, onChatCardCoolPointSpend } from "./dice.mjs";
import { rollStat, rollAttack, rollResist, rollDeath, rollInitiative, rollMove, rollNpcAttack } from "./roll-helpers.mjs";
import { ParagonsCharacterSheet } from "./sheets/character-sheet.mjs";
import { ParagonsNpcSheet }       from "./sheets/npc-sheet.mjs";
import { ParagonsItemSheet }      from "./sheets/item-sheet.mjs";

// Expose roll API globally so sheet classes and macros can reach it
globalThis.ParagonsRoll       = ParagonsRoll;
globalThis.ParagonsRollDialog = ParagonsRollDialog;

// ─────────────────────────────────────────────
//  init hook — runs before anything is rendered
// ─────────────────────────────────────────────
Hooks.once("init", () => {
  console.log("Paragons | Initialising system");

  // ── World Settings ─────────────────────────
  game.settings.register("paragons", "storyPoints", {
    name:    "Story Points",
    hint:    "GM Story Point pool. Resets each episode.",
    scope:   "world",
    config:  true,
    type:    Number,
    default: 0,
  });

  game.settings.register("paragons", "showDiceBreakdown", {
    name:    "Show Dice Breakdown in Chat",
    hint:    "Display individual die results on roll cards.",
    scope:   "client",
    config:  true,
    type:    Boolean,
    default: true,
  });

  // ── Register Actor data models ─────────────
  CONFIG.Actor.dataModels = {
    character: CharacterData,
    npc:       NpcData,
  };

  // ── Register Item data models ──────────────
  CONFIG.Item.dataModels = {
    ability: AbilityData,
    talent:  TalentData,
    gear:    GearData,
  };

  // ── Token bar attributes ───────────────────
  // Will and Resist are the two primary trackable bars.
  CONFIG.Actor.trackableAttributes = {
    character: {
      bar:   ["will", "resist", "coolPoints"],
      value: [],
    },
    npc: {
      bar:   ["will", "resist"],
      value: ["powerRating"],
    },
  };

  // ── Register Actor sheet classes ───────────
  // ── Actor Sheets ──────────────────────────
  Actors.unregisterSheet("core", ActorSheet);
  Actors.registerSheet("paragons", ParagonsCharacterSheet, {
    types: ["character"], makeDefault: true, label: "Paragons Character Sheet"
  });
  Actors.registerSheet("paragons", ParagonsNpcSheet, {
    types: ["npc"], makeDefault: true, label: "Paragons NPC Sheet"
  });

  // ── Item Sheets ───────────────────────────
  Items.unregisterSheet("core", ItemSheet);
  Items.registerSheet("paragons", ParagonsItemSheet, {
    types: ["ability", "talent", "gear"],
    makeDefault: true,
    label: "Paragons Item Sheet"
  });

  // ── Register Item sheet classes ────────────


  // ── Handlebars helpers ─────────────────────
  _registerHandlebarsHelpers();

  console.log("Paragons | Init complete");
});

// ─────────────────────────────────────────────
//  ready hook — runs after the world is loaded
// ─────────────────────────────────────────────
Hooks.once("ready", () => {
  console.log("Paragons | System ready");
});

// ─────────────────────────────────────────────
//  Chat card interactivity
// ─────────────────────────────────────────────
Hooks.on("renderChatMessage", (message, html) => {
  // Wire up the Cool Point spend button on roll cards
  html.find(".paragons-spend-cp").on("click", onChatCardCoolPointSpend);
});

// ─────────────────────────────────────────────
//  Handlebars helpers
// ─────────────────────────────────────────────
function _registerHandlebarsHelpers() {

  // Render a pool of d6 icons — useful for dice pool display
  Handlebars.registerHelper("dicePool", (count) => {
    return new Handlebars.SafeString(
      Array.from({ length: count }, () => `<i class="fas fa-dice-d6"></i>`).join("")
    );
  });

  // Capitalise first letter
  Handlebars.registerHelper("capitalize", (str) => {
    if (typeof str !== "string") return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
  });

  // Repeat a block N times (useful for reputation pip rendering)
  Handlebars.registerHelper("times", function(n, options) {
   let result = "";
   for (let i = 0; i < n; i++) result += options.fn(i);
   return result;
  });

  // Compare two values (eq, neq, lt, gt, lte, gte)
  Handlebars.registerHelper("compare", function(a, op, b, options) {
    const ops = { eq: a == b, neq: a != b, lt: a < b, gt: a > b, lte: a <= b, gte: a >= b };
    return ops[op] ? options.fn(this) : options.inverse(this);
  });

  // Return the archetype stat boost labels
  Handlebars.registerHelper("archetypeBoosts", (archetype) => {
    const boosts = {
      acrobat:     "+1 Finesse, +1 Presence",
      brawler:     "+1 Physique, +1 Stamina",
      commander:   "+1 Presence, +1 Physique",
      defender:    "+1 Acuity, +1 Stamina",
      facilitator: "+1 Stamina, +1 Presence",
      hunter:      "+1 Finesse, +1 Acuity",
      strategist:  "+1 Acuity, +1 Presence",
      striker:     "+1 Physique, +1 Finesse",
    };
    return boosts[archetype] ?? "—";
  });
}

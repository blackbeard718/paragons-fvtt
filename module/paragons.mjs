/**
 * paragons.mjs — Main entry point for Paragons: The Roleplaying Game
 * Foundry VTT V13 / ApplicationV2
 */

import { CharacterData } from "./actor/character-data.mjs";
import { NpcData }        from "./actor/npc-data.mjs";
import { AbilityData, TalentData, GearData } from "./item/item-data.mjs";
import { ParagonsRoll, ParagonsRollDialog, onChatCardCoolPointSpend } from "./dice.mjs";
import { rollStat, rollAttack, rollResist, rollDeath, rollInitiative, rollMove, rollNpcAttack } from "./roll-helpers.mjs";
import { ParagonsCharacterSheet } from "./sheets/character-sheet.mjs";
import { ParagonsNpcSheet }       from "./sheets/npc-sheet.mjs";
import { ParagonsItemSheet }      from "./sheets/item-sheet.mjs";

// Expose roll API globally for macros
globalThis.ParagonsRoll       = ParagonsRoll;
globalThis.ParagonsRollDialog = ParagonsRollDialog;

// ─────────────────────────────────────────────
//  init
// ─────────────────────────────────────────────
Hooks.once("init", () => {
  console.log("Paragons | Initialising system (V13)");

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

  // ── Data Models ────────────────────────────
  CONFIG.Actor.dataModels = {
    character: CharacterData,
    npc:       NpcData,
  };

  CONFIG.Item.dataModels = {
    ability: AbilityData,
    talent:  TalentData,
    gear:    GearData,
  };

  // ── Token Bar Attributes ───────────────────
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

  // ── Actor Sheets ──────────────────────────
  // Use V13 DocumentSheetConfig if available, fall back to legacy
  const sheetConfig = foundry?.applications?.apps?.DocumentSheetConfig
                   ?? foundry?.applications?.config?.DocumentSheetConfig;

  const _unregisterActor = (ns, cls) =>
    sheetConfig?.unregisterSheet
      ? sheetConfig.unregisterSheet(CONFIG.Actor.documentClass, ns, cls)
      : Actors.unregisterSheet(ns, cls);

  const _registerActor = (ns, cls, opts) =>
    sheetConfig?.registerSheet
      ? sheetConfig.registerSheet(CONFIG.Actor.documentClass, ns, cls, opts)
      : Actors.registerSheet(ns, cls, opts);

  const _unregisterItem = (ns, cls) =>
    sheetConfig?.unregisterSheet
      ? sheetConfig.unregisterSheet(CONFIG.Item.documentClass, ns, cls)
      : Items.unregisterSheet(ns, cls);

  const _registerItem = (ns, cls, opts) =>
    sheetConfig?.registerSheet
      ? sheetConfig.registerSheet(CONFIG.Item.documentClass, ns, cls, opts)
      : Items.registerSheet(ns, cls, opts);

  _unregisterActor("core", foundry?.appv1?.sheets?.ActorSheet ?? ActorSheet);
  _registerActor("paragons", ParagonsCharacterSheet, {
    types: ["character"], makeDefault: true, label: "PARAGONS.Sheets.Character",
  });
  _registerActor("paragons", ParagonsNpcSheet, {
    types: ["npc"], makeDefault: true, label: "PARAGONS.Sheets.Npc",
  });

  _unregisterItem("core", foundry?.appv1?.sheets?.ItemSheet ?? ItemSheet);
  _registerItem("paragons", ParagonsItemSheet, {
    types: ["ability", "talent", "gear"], makeDefault: true, label: "PARAGONS.Sheets.Item",
  });

  // ── Handlebars Helpers ─────────────────────
  _registerHandlebarsHelpers();

  console.log("Paragons | Init complete");
});

// ─────────────────────────────────────────────
//  ready
// ─────────────────────────────────────────────
Hooks.once("ready", () => {
  console.log("Paragons | System ready");
});

// ─────────────────────────────────────────────
//  Chat card — Cool Point button
// ─────────────────────────────────────────────
Hooks.on("renderChatMessageHTML", (message, html) => {
  // V13: html is a plain HTMLElement
  html.querySelectorAll?.(".paragons-spend-cp").forEach(btn => {
    btn.addEventListener("click", onChatCardCoolPointSpend);
  });
});

// ─────────────────────────────────────────────
//  Handlebars Helpers
// ─────────────────────────────────────────────
function _registerHandlebarsHelpers() {

  // Simple equality — used as {{#if (eq a b)}}
  Handlebars.registerHelper("eq",  (a, b) => a == b);
  Handlebars.registerHelper("neq", (a, b) => a != b);
  Handlebars.registerHelper("lt",  (a, b) => a <  b);
  Handlebars.registerHelper("gt",  (a, b) => a >  b);
  Handlebars.registerHelper("lte", (a, b) => a <= b);
  Handlebars.registerHelper("gte", (a, b) => a >= b);

  // Repeat N times — {{#times 5}}...{{/times}}
  Handlebars.registerHelper("times", function(n, options) {
    let result = "";
    for (let i = 0; i < n; i++) result += options.fn(i);
    return result;
  });

  // Dice pool icon string
  Handlebars.registerHelper("dicePool", (count) => {
    return new Handlebars.SafeString(
      Array.from({ length: count }, () => `<i class="fas fa-dice-d6"></i>`).join("")
    );
  });

  // Capitalize first letter
  Handlebars.registerHelper("capitalize", (str) => {
    if (typeof str !== "string") return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
  });

  // Archetype stat boost label
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

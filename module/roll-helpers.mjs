/**
 * roll-helpers.mjs
 *
 * Convenience functions called directly from actor/item sheet event handlers.
 * Each helper builds the appropriate ParagonsRollConfig and hands off to
 * ParagonsRollDialog.prompt(), which decides dialog vs. direct roll
 * based on whether the event had the shift key held.
 */

import { ParagonsRollConfig, ParagonsRollDialog, ROLL_TYPES } from "./dice.mjs";

// ─────────────────────────────────────────────
//  Stat Roll
//  Called when player clicks a stat label on the character sheet.
//  e.g. clicking "Physique 3" → 3d6 stat roll
// ─────────────────────────────────────────────
export async function rollStat(actor, statKey, event) {
  const statValue = actor.system.stats[statKey] ?? 1;
  const label     = `${_statLabel(statKey)} Roll`;

  const config = new ParagonsRollConfig({
    actor,
    rollType:  ROLL_TYPES.MOVE,
    label,
    statKey,
    statDice:  statValue,
  });

  return ParagonsRollDialog.prompt(config, { force: event?.shiftKey });
}

// ─────────────────────────────────────────────
//  Attack Roll
//  Called from the attack move button.
//  Player picks which stat drives the attack (Physique or Finesse typically).
// ─────────────────────────────────────────────
export async function rollAttack(actor, statKey, { abilityDice = 0, gearDice = 0, label = "Attack", event } = {}) {
  const statValue = actor.system.stats[statKey] ?? 1;

  const config = new ParagonsRollConfig({
    actor,
    rollType:    ROLL_TYPES.ATTACK,
    label:       `${label} (${_statLabel(statKey)})`,
    statKey,
    statDice:    statValue,
    abilityDice,
    gearDice,
  });

  return ParagonsRollDialog.prompt(config, { force: event?.shiftKey });
}

// ─────────────────────────────────────────────
//  Resist Roll
//  Called when an ability triggers a resist roll.
//  Resist rolls use a specified stat (often Stamina, Acuity, or Presence).
// ─────────────────────────────────────────────
export async function rollResist(actor, statKey, { label = "Resist Roll", event } = {}) {
  const statValue = actor.system.stats[statKey] ?? 1;

  const config = new ParagonsRollConfig({
    actor,
    rollType: ROLL_TYPES.RESIST,
    label:    `${label} (${_statLabel(statKey)})`,
    statKey,
    statDice: statValue,
  });

  return ParagonsRollDialog.prompt(config, { force: event?.shiftKey });
}

// ─────────────────────────────────────────────
//  Death Roll
//  Stamina only, no additions except the Stamina stat itself.
// ─────────────────────────────────────────────
export async function rollDeath(actor, event) {
  const stamina = actor.system.stats.stamina ?? 1;

  const config = new ParagonsRollConfig({
    actor,
    rollType:    ROLL_TYPES.DEATH,
    label:       "Death Roll",
    statKey:     "stamina",
    statDice:    stamina,
    isDeathRoll: true,
    flavor:      "Hanging on by a thread...",
  });

  // Death rolls always show the dialog so the player sees what's happening
  return ParagonsRollDialog.prompt(config, { force: true });
}

// ─────────────────────────────────────────────
//  NPC Attack Roll
//  Uses the pre-calculated dice pool from the NPC's attackMoves array.
// ─────────────────────────────────────────────
export async function rollNpcAttack(actor, attackMove, event) {
  const config = new ParagonsRollConfig({
    actor,
    rollType:  ROLL_TYPES.ATTACK,
    label:     `${actor.name}: ${attackMove.label}`,
    statKey:   attackMove.stat,
    statDice:  attackMove.dicePool,
    // NPC dice pools are already totalled in the stat block;
    // we don't break them down further for NPCs.
    flavor:    `${attackMove.range ? _rangeLabel(attackMove.range) + " range" : ""}`,
  });

  return ParagonsRollDialog.prompt(config, { force: event?.shiftKey });
}

// ─────────────────────────────────────────────
//  Initiative Roll  (Combat Tracker)
//  Paragons uses a team Physique roll at the start of each action scene.
//  Each character rolls and successes are pooled per team.
// ─────────────────────────────────────────────
export async function rollInitiative(actor, event) {
  const physique = actor.system.stats?.physique ?? actor.system.stats?.physique ?? 2;

  const config = new ParagonsRollConfig({
    actor,
    rollType:  ROLL_TYPES.TEAM,
    label:     "Initiative (Physique)",
    statKey:   "physique",
    statDice:  physique,
    flavor:    "Team Physique roll — pool successes with your allies.",
  });

  return ParagonsRollDialog.prompt(config, { force: event?.shiftKey });
}

// ─────────────────────────────────────────────
//  Ability / Move Roll
//  Generic roll for any standard move (Observe, Persuade, Hide, etc.)
// ─────────────────────────────────────────────
export async function rollMove(actor, { statKey, label = "Move Roll", abilityDice = 0, gearDice = 0, event } = {}) {
  const statValue = actor.system.stats[statKey] ?? 1;

  const config = new ParagonsRollConfig({
    actor,
    rollType:    ROLL_TYPES.MOVE,
    label,
    statKey,
    statDice:    statValue,
    abilityDice,
    gearDice,
  });

  return ParagonsRollDialog.prompt(config, { force: event?.shiftKey });
}

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────

function _statLabel(key) {
  const labels = {
    physique: "Physique",
    finesse:  "Finesse",
    stamina:  "Stamina",
    acuity:   "Acuity",
    presence: "Presence",
  };
  return labels[key] ?? key;
}

function _rangeLabel(key) {
  const labels = { close: "Close", near: "Near", far: "Far", distant: "Distant" };
  return labels[key] ?? key;
}

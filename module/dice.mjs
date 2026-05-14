/**
 * dice.mjs — Core dice pool assembly and rolling for Paragons
 *
 * Roll flow:
 *   1. Caller builds a ParagonsRollConfig
 *   2. ParagonsRollDialog.prompt() shows the pre-roll dialog (shift-click)
 *      OR roll fires immediately with defaults (regular click)
 *   3. ParagonsRoll.evaluate() rolls the pool and counts successes
 *   4. ParagonsRoll.toMessage() posts the chat card with the spend-Cool-Point button
 */

// ─────────────────────────────────────────────
//  Constants
// ─────────────────────────────────────────────

export const ROLL_TYPES = {
  MOVE:    "move",
  RESIST:  "resist",
  ATTACK:  "attack",
  TEAM:    "team",
  DEATH:   "death",
  OPPOSED: "opposed",
};

// Success thresholds
const SUCCESS_VALUE  = 5; // 5 = 1 success
const CRITICAL_VALUE = 6; // 6 = 2 successes (critical)
const MIN_POOL_SIZE  = 1; // pool can never go below 1d6

// ─────────────────────────────────────────────
//  ParagonsRollConfig
//  Plain data object describing what to roll.
// ─────────────────────────────────────────────

export class ParagonsRollConfig {
  constructor({
    actor,
    rollType      = ROLL_TYPES.MOVE,
    label         = "Roll",
    statKey       = null,      // "physique" | "finesse" | "stamina" | "acuity" | "presence"
    statDice      = 0,
    abilityDice   = 0,
    gearDice      = 0,
    circumstanceDice = 0,      // positive = bonus, negative = penalty
    spendCoolPoint = false,    // pre-roll Cool Point toggle
    flavor        = "",
    // For death rolls — Stamina only, no additions
    isDeathRoll   = false,
  } = {}) {
    this.actor           = actor;
    this.rollType        = rollType;
    this.label           = label;
    this.statKey         = statKey;
    this.statDice        = statDice;
    this.abilityDice     = abilityDice;
    this.gearDice        = gearDice;
    this.circumstanceDice = circumstanceDice;
    this.spendCoolPoint  = spendCoolPoint;
    this.flavor          = flavor;
    this.isDeathRoll     = isDeathRoll;
  }

  /** Total dice before Cool Point bonus. Never below MIN_POOL_SIZE. */
  get totalDice() {
    if (this.isDeathRoll) return Math.max(MIN_POOL_SIZE, this.statDice);
    const raw = this.statDice + this.abilityDice + this.gearDice + this.circumstanceDice;
    return Math.max(MIN_POOL_SIZE, raw);
  }

  /** Breakdown string for display. */
  get poolBreakdown() {
    const parts = [];
    if (this.statDice)        parts.push(`${this.statDice} stat`);
    if (this.abilityDice)     parts.push(`${this.abilityDice} ability/talent`);
    if (this.gearDice)        parts.push(`${this.gearDice} gear`);
    if (this.circumstanceDice > 0) parts.push(`+${this.circumstanceDice} circumstance`);
    if (this.circumstanceDice < 0) parts.push(`${this.circumstanceDice} circumstance`);
    return parts.length ? parts.join(" + ") : "1 (minimum)";
  }
}

// ─────────────────────────────────────────────
//  ParagonsRoll
//  Wraps Foundry's Roll class with Paragons logic.
// ─────────────────────────────────────────────

export class ParagonsRoll {
  constructor(config) {
    this.config   = config;
    this.roll     = null;   // Foundry Roll instance
    this.results  = [];     // array of { value, successes }
    this.totalSuccesses = 0;
    this.coolPointSpent = false;
  }

  // ── Evaluate ──────────────────────────────

  async evaluate() {
    const diceCount = this.config.totalDice;
    const formula   = `${diceCount}d6`;

    this.roll = new Roll(formula);
    await this.roll.evaluate();

    // Parse individual die results
    this.results = this.roll.dice[0].results.map(r => ({
      value:     r.result,
      successes: r.result >= CRITICAL_VALUE ? 2
               : r.result >= SUCCESS_VALUE  ? 1
               : 0,
      isCritical: r.result >= CRITICAL_VALUE,
      isSuccess:  r.result >= SUCCESS_VALUE,
      isFailure:  r.result < SUCCESS_VALUE,
    }));

    this.totalSuccesses = this.results.reduce((sum, r) => sum + r.successes, 0);

    // Apply pre-roll Cool Point spend (+1 success)
    if (this.config.spendCoolPoint) {
      await this._applyCoolPointSpend();
    }

    return this;
  }

  // ── Cool Point spend (pre or post roll) ───

  async _applyCoolPointSpend() {
    const actor = this.config.actor;
    if (!actor) return;

    const currentCP = actor.system.coolPoints.value;
    if (currentCP <= 0) {
      ui.notifications.warn("No Cool Points remaining!");
      return;
    }

    // Deduct 1 Cool Point from actor
    await actor.update({ "system.coolPoints.value": currentCP - 1 });
    this.totalSuccesses += 1;
    this.coolPointSpent  = true;

    // GM gains 1 Story Point — stored on a world setting
    const currentSP = game.settings.get("paragons", "storyPoints") ?? 0;
    await game.settings.set("paragons", "storyPoints", currentSP + 1);

    ui.notifications.info(
      `Cool Point spent! +1 success. GM gains 1 Story Point (now ${currentSP + 1}).`
    );
  }

  // ── Result classification ──────────────────

  get isFailure()  { return this.totalSuccesses === 0; }
  get isSuccess()  { return this.totalSuccesses > 0; }
  get successLabel() {
    if (this.isFailure) return "Failure";
    if (this.totalSuccesses === 1) return "1 Success";
    return `${this.totalSuccesses} Successes`;
  }

  // ── Post to chat ───────────────────────────

  async toMessage({ rollMode } = {}) {
    const mode = rollMode ?? game.settings.get("core", "rollMode");

    const templateData = {
      config:         this.config,
      results:        this.results,
      totalSuccesses: this.totalSuccesses,
      isFailure:      this.isFailure,
      isSuccess:      this.isSuccess,
      successLabel:   this.successLabel,
      coolPointSpent: this.coolPointSpent,
      canSpendCP:     !this.coolPointSpent
                      && (this.config.actor?.system.coolPoints.value ?? 0) > 0,
      actorId:        this.config.actor?.id ?? null,
      breakdown:      this.config.poolBreakdown,
      label:          this.config.label,
      flavor:         this.config.flavor,
      rollType:       this.config.rollType,
      isDeathRoll:    this.config.isDeathRoll,
    };

    const _renderTemplate = foundry?.applications?.handlebars?.renderTemplate ?? renderTemplate;
    const html = await _renderTemplate(
      "systems/paragons/templates/chat/roll-card.hbs",
      templateData
    );

    const messageData = {
      speaker: ChatMessage.getSpeaker({ actor: this.config.actor }),
      content: html,
      rolls:   [this.roll],
      flags:   {
        paragons: {
          rollData:  templateData,
          actorId:   this.config.actor?.id ?? null,
          rollType:  this.config.rollType,
        }
      }
    };

    return ChatMessage.create(
      ChatMessage.applyRollMode(messageData, mode)
    );
  }
}

// ─────────────────────────────────────────────
//  ParagonsRollDialog
//  Pre-roll dialog for assembling the dice pool.
//  Shift-click → shows dialog
//  Regular click → rolls with defaults
// ─────────────────────────────────────────────

export class ParagonsRollDialog {

  /**
   * Main entry point.
   * @param {ParagonsRollConfig} config  - Pre-built config from the sheet click
   * @param {boolean}            force   - Force dialog even without shift
   * @returns {ParagonsRoll|null}
   */
  static async prompt(config, { force = false } = {}) {
    if (force) {
      return ParagonsRollDialog._showDialog(config);
    }
    return ParagonsRollDialog._rollDirect(config);
  }

  static async _rollDirect(config) {
    const roll = new ParagonsRoll(config);
    await roll.evaluate();
    await roll.toMessage();
    return roll;
  }

  static async _showDialog(config) {
    const actor       = config.actor;
    const cpAvailable = actor?.system.coolPoints.value ?? 0;
    const currentMode = game.settings.get("core", "rollMode");

    // Build roll mode options
    const rollModeOptions = Object.entries(CONFIG.Dice.rollModes)
      .map(([k, v]) => `<option value="${k}" ${k === currentMode ? "selected" : ""}>${game.i18n.localize(v)}</option>`)
      .join("");

    const poolRows = config.isDeathRoll ? `
      <div class="pool-row">
        <label>Stat Dice (Stamina)</label>
        <input type="number" name="statDice" value="${config.statDice}" min="0" max="20" disabled />
      </div>` : `
      <div class="pool-row">
        <label>Stat Dice</label>
        <input type="number" name="statDice" value="${config.statDice}" min="0" max="20" />
      </div>
      <div class="pool-row">
        <label>Ability / Talent Dice</label>
        <input type="number" name="abilityDice" value="${config.abilityDice}" min="0" max="20" />
      </div>
      <div class="pool-row">
        <label>Gear Dice</label>
        <input type="number" name="gearDice" value="${config.gearDice}" min="0" max="3" />
      </div>
      <div class="pool-row">
        <label>Circumstance Dice <span class="hint">(negative = penalty)</span></label>
        <input type="number" name="circumstanceDice" value="${config.circumstanceDice}" min="-2" max="2" />
      </div>`;

    const cpSection = cpAvailable > 0
      ? `<div class="cool-point-section">
          <label class="checkbox-label">
            <input type="checkbox" name="spendCoolPoint" ${config.spendCoolPoint ? "checked" : ""} />
            <span>Spend Cool Point (+1 success)</span>
            <span class="cp-remaining">(${cpAvailable} remaining)</span>
          </label>
          <p class="hint">GM gains 1 Story Point.</p>
        </div>`
      : `<div class="cool-point-section exhausted"><p>No Cool Points remaining.</p></div>`;

    const content = `
      <div class="paragons-roll-dialog">
        <div class="roll-header">
          <span class="roll-label">${config.label}</span>
        </div>
        <div class="pool-section">
          <h3>Dice Pool</h3>
          ${poolRows}
          <div class="pool-total">Total: <strong class="total-dice-count">${config.totalDice}</strong>d6</div>
        </div>
        ${cpSection}
        <div class="roll-options">
          <label>Roll Mode
            <select name="rollMode">${rollModeOptions}</select>
          </label>
          <label>Flavor
            <input type="text" name="flavor" value="${config.flavor}" placeholder="Describe the action..." />
          </label>
        </div>
      </div>`;

    return new Promise((resolve) => {
      const dialog = new foundry.applications.api.DialogV2({
        window: { title: config.label },
        content,
        buttons: [
          {
            action: "roll",
            label:  "Roll",
            icon:   "fas fa-dice-d6",
            default: true,
            callback: async (event, button, dialogEl) => {
              const form    = dialogEl.querySelector(".paragons-roll-dialog");
              const getVal  = (name, fallback = 0) => parseInt(form.querySelector(`[name="${name}"]`)?.value) || fallback;
              const checked = (name) => form.querySelector(`[name="${name}"]`)?.checked ?? false;

              const updated = new ParagonsRollConfig({
                actor:            config.actor,
                rollType:         config.rollType,
                label:            config.label,
                statKey:          config.statKey,
                isDeathRoll:      config.isDeathRoll,
                statDice:         getVal("statDice", config.statDice),
                abilityDice:      config.isDeathRoll ? 0 : getVal("abilityDice"),
                gearDice:         config.isDeathRoll ? 0 : getVal("gearDice"),
                circumstanceDice: config.isDeathRoll ? 0 : getVal("circumstanceDice"),
                spendCoolPoint:   checked("spendCoolPoint"),
                flavor:           form.querySelector('[name="flavor"]')?.value ?? "",
              });

              const roll = new ParagonsRoll(updated);
              await roll.evaluate();
              await roll.toMessage({ rollMode: form.querySelector('[name="rollMode"]')?.value });
              resolve(roll);
            },
          },
          {
            action:   "cancel",
            label:    "Cancel",
            callback: () => resolve(null),
          },
        ],
        rejectClose: false,
        render: (event, dialogEl) => {
          // Live-update total dice count
          dialogEl.querySelectorAll('input[type="number"]').forEach(input => {
            input.addEventListener("input", () => {
              const getV = (name, fb = 0) => parseInt(dialogEl.querySelector(`[name="${name}"]`)?.value) || fb;
              let total;
              if (config.isDeathRoll) {
                total = Math.max(MIN_POOL_SIZE, getV("statDice", config.statDice));
              } else {
                total = Math.max(MIN_POOL_SIZE,
                  getV("statDice") + getV("abilityDice") + getV("gearDice") + getV("circumstanceDice"));
              }
              const el = dialogEl.querySelector(".total-dice-count");
              if (el) el.textContent = total;
            });
          });
        },
      });

      dialog.render({ force: true });
    });
  }
}

// ─────────────────────────────────────────────
//  Chat card hook — Cool Point button handler
//  Wired up in paragons.mjs via Hooks.on("renderChatMessage")
// ─────────────────────────────────────────────

export async function onChatCardCoolPointSpend(event) {
  event.preventDefault();

  const button  = event.currentTarget;
  const card    = button.closest(".paragons-roll-card");
  const actorId = card?.dataset.actorId;
  const messageId = card?.closest("[data-message-id]")?.dataset.messageId;

  if (!actorId || !messageId) return;

  const actor   = game.actors.get(actorId);
  const message = game.messages.get(messageId);
  if (!actor || !message) return;

  // Verify the spending player owns this actor
  if (!actor.isOwner) {
    ui.notifications.warn("You don't own this actor.");
    return;
  }

  const currentCP = actor.system.coolPoints.value;
  if (currentCP <= 0) {
    ui.notifications.warn("No Cool Points remaining!");
    return;
  }

  // Deduct Cool Point
  await actor.update({ "system.coolPoints.value": currentCP - 1 });

  // GM gains Story Point
  if (game.user.isGM || game.users.find(u => u.isGM && u.active)) {
    const currentSP = game.settings.get("paragons", "storyPoints") ?? 0;
    await game.settings.set("paragons", "storyPoints", currentSP + 1);
  }

  // Update the chat card flags to reflect the spend
  const flagData = message.flags?.paragons?.rollData ?? {};
  flagData.totalSuccesses  = (flagData.totalSuccesses ?? 0) + 1;
  flagData.coolPointSpent  = true;
  flagData.canSpendCP      = false;

  // Re-render and update the message
  const _renderTemplate2 = foundry?.applications?.handlebars?.renderTemplate ?? renderTemplate;
  const html = await _renderTemplate2(
    "systems/paragons/templates/chat/roll-card.hbs",
    flagData
  );

  await message.update({
    content: html,
    "flags.paragons.rollData": flagData,
  });

  ui.notifications.info(
    `Cool Point spent! +1 success. GM Story Points: ${game.settings.get("paragons", "storyPoints")}.`
  );
}

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

    const html = await renderTemplate(
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

export class ParagonsRollDialog extends Dialog {

  /**
   * Main entry point.
   * @param {ParagonsRollConfig} config  - Pre-built config from the sheet click
   * @param {boolean}            force   - Force dialog even without shift
   * @returns {ParagonsRoll|null}
   */
  static async prompt(config, { force = false } = {}) {
    // Shift-click or forced → show dialog
    if (force) {
      return ParagonsRollDialog._showDialog(config);
    }
    // Regular click → roll immediately
    return ParagonsRollDialog._rollDirect(config);
  }

  static async _rollDirect(config) {
    const roll = new ParagonsRoll(config);
    await roll.evaluate();
    await roll.toMessage();
    return roll;
  }

  static async _showDialog(config) {
    return new Promise((resolve) => {

      const actor = config.actor;
      const cpAvailable = actor?.system.coolPoints.value ?? 0;

      const dialog = new ParagonsRollDialog({
        title: config.label,
        content: ParagonsRollDialog._buildContent(config, cpAvailable),
        buttons: {
          roll: {
            label: "Roll",
            icon:  '<i class="fas fa-dice-d6"></i>',
            callback: async (html) => {
              const updated = ParagonsRollDialog._readFormValues(html, config);
              const roll = new ParagonsRoll(updated);
              await roll.evaluate();
              await roll.toMessage({
                rollMode: html.find('[name="rollMode"]').val()
              });
              resolve(roll);
            }
          },
          cancel: {
            label: "Cancel",
            callback: () => resolve(null)
          }
        },
        default: "roll",
        render: (html) => {
          // Live-update the total dice count as sliders change
          html.find(".paragons-roll-input").on("change input", () => {
            ParagonsRollDialog._updateTotal(html, config);
          });
          ParagonsRollDialog._updateTotal(html, config);
        }
      }, {
        classes: ["paragons", "dialog", "roll-dialog"],
        width: 420,
      });

      dialog.render(true);
    });
  }

  static _buildContent(config, cpAvailable) {
    const rollModeOptions = Object.entries(CONFIG.Dice.rollModes)
      .map(([k, v]) => `<option value="${k}">${game.i18n.localize(v)}</option>`)
      .join("");

    const currentMode = game.settings.get("core", "rollMode");

    return `
<form class="paragons-roll-dialog">

  <div class="roll-header">
    <span class="roll-label">${config.label}</span>
    ${config.statKey ? `<span class="roll-stat">${game.i18n.localize(`PARAGONS.Stats.${config.statKey}`)}</span>` : ""}
  </div>

  <div class="pool-section">
    <h3>Dice Pool</h3>

    <div class="pool-row">
      <label>Stat Dice</label>
      <input type="number" name="statDice" class="paragons-roll-input"
             value="${config.statDice}" min="0" max="20" ${config.isDeathRoll ? "disabled" : ""} />
    </div>

    ${config.isDeathRoll ? "" : `
    <div class="pool-row">
      <label>Ability / Talent Dice</label>
      <input type="number" name="abilityDice" class="paragons-roll-input"
             value="${config.abilityDice}" min="0" max="20" />
    </div>

    <div class="pool-row">
      <label>Gear Dice</label>
      <input type="number" name="gearDice" class="paragons-roll-input"
             value="${config.gearDice}" min="0" max="3" />
    </div>

    <div class="pool-row">
      <label>Circumstance Dice
        <span class="hint">(negative = penalty)</span>
      </label>
      <input type="number" name="circumstanceDice" class="paragons-roll-input"
             value="${config.circumstanceDice}" min="-2" max="2" />
    </div>
    `}

    <div class="pool-total">
      Total: <strong class="total-dice-count">—</strong>d6
    </div>
  </div>

  ${cpAvailable > 0 ? `
  <div class="cool-point-section">
    <label class="checkbox-label">
      <input type="checkbox" name="spendCoolPoint" ${config.spendCoolPoint ? "checked" : ""} />
      <span>Spend Cool Point for +1 success</span>
      <span class="cp-remaining">(${cpAvailable} remaining)</span>
    </label>
    <p class="hint">GM gains 1 Story Point when you do this.</p>
  </div>
  ` : `
  <div class="cool-point-section exhausted">
    <p>No Cool Points remaining this episode.</p>
  </div>
  `}

  <div class="roll-options">
    <label>Roll Mode</label>
    <select name="rollMode">
      ${rollModeOptions.replace(`value="${currentMode}"`, `value="${currentMode}" selected`)}
    </select>

    <label>Flavor (optional)</label>
    <input type="text" name="flavor" value="${config.flavor}" placeholder="Describe the action..." />
  </div>

</form>`;
  }

  static _readFormValues(html, originalConfig) {
    const getValue = (name, fallback = 0) =>
      parseInt(html.find(`[name="${name}"]`).val()) || fallback;

    return new ParagonsRollConfig({
      actor:            originalConfig.actor,
      rollType:         originalConfig.rollType,
      label:            originalConfig.label,
      statKey:          originalConfig.statKey,
      isDeathRoll:      originalConfig.isDeathRoll,
      statDice:         getValue("statDice", originalConfig.statDice),
      abilityDice:      originalConfig.isDeathRoll ? 0 : getValue("abilityDice"),
      gearDice:         originalConfig.isDeathRoll ? 0 : getValue("gearDice"),
      circumstanceDice: originalConfig.isDeathRoll ? 0 : getValue("circumstanceDice"),
      spendCoolPoint:   html.find('[name="spendCoolPoint"]').prop("checked") ?? false,
      flavor:           html.find('[name="flavor"]').val() ?? "",
    });
  }

  static _updateTotal(html, config) {
    const getValue = (name, fallback = 0) =>
      parseInt(html.find(`[name="${name}"]`).val()) || fallback;

    let total;
    if (config.isDeathRoll) {
      total = Math.max(MIN_POOL_SIZE, getValue("statDice", config.statDice));
    } else {
      const raw = getValue("statDice")
                + getValue("abilityDice")
                + getValue("gearDice")
                + getValue("circumstanceDice");
      total = Math.max(MIN_POOL_SIZE, raw);
    }

    html.find(".total-dice-count").text(total);
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
  const html = await renderTemplate(
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

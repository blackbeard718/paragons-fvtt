const {
  HTMLField,
  SchemaField,
  NumberField,
  StringField,
  FilePathField,
  ArrayField,
  BooleanField,
} = foundry.data.fields;

// ─────────────────────────────────────────────
//  CharacterData  (PC Actor)
// ─────────────────────────────────────────────
export class CharacterData extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {

      // ── Identity / Meta ───────────────────────
      pronouns:    new StringField({ required: false, initial: "" }),
      playerName:  new StringField({ required: false, initial: "" }),
      sessionNotes: new StringField({ required: false, initial: "" }),

      // ── Concept ──────────────────────────────
      biography:   new HTMLField({ required: false, initial: "" }),
      origin:      new StringField({ required: false, initial: "" }),
      motive:      new StringField({ required: false, initial: "" }),
      flaw:        new StringField({ required: false, initial: "" }),
      secretId:    new StringField({ required: false, initial: "" }),
      notes:       new HTMLField({ required: false, initial: "" }),

      // ── Level ─────────────────────────────────
      // No hard cap in the rules; practical ceiling ~6+ based on ability tiers.
      level: new NumberField({
        required: true, integer: true, min: 1, initial: 1
      }),

      // ── Stats (base values; ability bonuses applied in prepareBaseData) ──
      // Standard human average = 2; range 1–6 (abilities can push to 7 or 8).
      stats: new SchemaField({
        physique: new NumberField({ required: true, integer: true, min: 1, max: 10, initial: 1 }),
        finesse:  new NumberField({ required: true, integer: true, min: 1, max: 10, initial: 1 }),
        stamina:  new NumberField({ required: true, integer: true, min: 1, max: 10, initial: 1 }),
        acuity:   new NumberField({ required: true, integer: true, min: 1, max: 10, initial: 1 }),
        presence: new NumberField({ required: true, integer: true, min: 1, max: 10, initial: 1 }),
      }),

      // ── Archetype ─────────────────────────────
      archetype: new StringField({
       required: false,
       initial: "",
       blank: true,
      }),

      // ── Will (current / max tracked here; max derived) ───────────────────
      will: new SchemaField({
        value: new NumberField({ required: true, integer: true, min: 0, initial: 3 }),
        max:   new NumberField({ required: true, integer: true, min: 0, initial: 3 }),
      }),

      // ── Resist Score (current / max tracked here; max derived) ───────────
      resist: new SchemaField({
        value: new NumberField({ required: true, integer: true, min: 0, initial: 2 }),
        max:   new NumberField({ required: true, integer: true, min: 0, initial: 2 }),
      }),

      // ── Cool Points (per-episode pool; max derived) ───────────────────────
      coolPoints: new SchemaField({
        value: new NumberField({ required: true, integer: true, min: 0, initial: 2 }),
        max:   new NumberField({ required: true, integer: true, min: 0, initial: 2 }),
      }),

      // ── Movement ─────────────────────────────
      // Base 8; abilities can set to 16, 24, or 32.
      movement: new NumberField({ required: true, integer: true, min: 0, initial: 8 }),

      // ── Reputation ───────────────────────────
      // 7 tiers: villain(0) → bad(1) → poor(2) → neutral(3)
      //          → positive(4) → good(5) → paragon(6)
      reputation: new SchemaField({
        tier:         new NumberField({ required: true, integer: true, min: 0, max: 6, initial: 3 }),
        featsEarned:  new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
        failuresEarned: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      }),

      // ── Advancement tracking ─────────────────
      // Leveling is narrative-arc-based; no XP. We track choices made.
      advancement: new SchemaField({
        // At each level-up the player chose one of: "ability" | "stats" | "talent"
        levelHistory: new ArrayField(new StringField({ initial: "" })),
      }),

    };
  }

  // ─────────────────────────────────────────────
  //  Migration: handle any legacy field renames
  // ─────────────────────────────────────────────
  static migrateData(source) {
    return super.migrateData(source);
  }

  // ─────────────────────────────────────────────
  //  prepareBaseData
  //  Runs BEFORE embedded items are processed.
  //  Use for anything that doesn't depend on items.
  // ─────────────────────────────────────────────
  prepareBaseData() {
    super.prepareBaseData();

    // Stat caps default to 6; abilities like Enhanced Stat push to 7, Supreme Stat to 8.
    // The cap is stored on the actor flag set by individual abilities — nothing to
    // calculate here, but we expose effective stats for derived calculations.
    this._effectiveStats = { ...this.stats };
  }

  // ─────────────────────────────────────────────
  //  prepareDerivedData
  //  Runs AFTER embedded items (abilities, etc.) are processed.
  //  Items that boost stats should set flags on the parent actor;
  //  we read those here to produce final derived values.
  // ─────────────────────────────────────────────
  prepareDerivedData() {
    super.prepareDerivedData();

    const stats = this._effectiveStats;
    const lvl   = this.level;

    // Will max  = Level + Stamina
    // (Battle Scars talent adds a flat +5 — stored as actor flag by the item)
    const battleScarsBonus = this.parent?.getFlag("paragons", "battleScarsBonus") ?? 0;
    this.will.max = lvl + stats.stamina + battleScarsBonus;
    this.will.value = Math.min(this.will.value, this.will.max);

    // Resist max = Physique + Acuity
    // Thick Skin doubles Physique; Determined Resistance doubles Acuity;
    // Unstoppable quadruples Physique; Mental Fortitude quadruples Acuity.
    // These multipliers are stored as actor flags set by ability items.
    const physMult = this.parent?.getFlag("paragons", "physiqueMult") ?? 1;
    const acuMult  = this.parent?.getFlag("paragons", "acuityMult")  ?? 1;
    this.resist.max = (stats.physique * physMult) + (stats.acuity * acuMult);
    this.resist.value = Math.min(this.resist.value, this.resist.max);

    // Cool Points max = Level + Presence
    this.coolPoints.max = lvl + stats.presence;
    this.coolPoints.value = Math.min(this.coolPoints.value, this.coolPoints.max);
  }

  // ─────────────────────────────────────────────
  //  Computed getters (convenience)
  // ─────────────────────────────────────────────

  /** True when Will has reached 0 (knocked out). */
  get isKnockedOut() {
    return this.will.value <= 0;
  }

  /** True when knocked out AND takes another hit (dying state). */
  get isDying() {
    return this.parent?.getFlag("paragons", "dying") ?? false;
  }

  /** Reputation tier label. */
  get reputationLabel() {
    const labels = ["Villain", "Bad", "Poor", "Neutral", "Positive", "Good", "Paragon"];
    return labels[this.reputation.tier] ?? "Neutral";
  }

  /**
   * Feats required to advance from current reputation tier.
   * Failures required to drop from current tier.
   * Chart (feats needed to go UP, failures needed to go DOWN):
   *   Villain(0)→Bad(1):    1 feat  | —
   *   Bad(1)→Poor(2):       1 feat  | 4 failures
   *   Poor(2)→Neutral(3):   1 feat  | 3 failures
   *   Neutral(3)→Positive(4): 2 feats | 2 failures
   *   Positive(4)→Good(5):  3 feats | 1 failure
   *   Good(5)→Paragon(6):   4 feats | 1 failure
   */
  get reputationThresholds() {
    const table = [
      { featsNeeded: 1, failuresNeeded: null }, // Villain → Bad
      { featsNeeded: 1, failuresNeeded: 4    }, // Bad → Poor
      { featsNeeded: 1, failuresNeeded: 3    }, // Poor → Neutral
      { featsNeeded: 2, failuresNeeded: 2    }, // Neutral → Positive
      { featsNeeded: 3, failuresNeeded: 1    }, // Positive → Good
      { featsNeeded: 4, failuresNeeded: 1    }, // Good → Paragon
      { featsNeeded: null, failuresNeeded: 1 }, // Paragon (max; can fall)
    ];
    return table[this.reputation.tier];
  }
}

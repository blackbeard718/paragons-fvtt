const {
  HTMLField,
  SchemaField,
  NumberField,
  StringField,
  ArrayField,
  BooleanField,
} = foundry.data.fields;

// ─────────────────────────────────────────────
//  AbilityData  (Item type: "ability")
// ─────────────────────────────────────────────
// Abilities are the powers a paragon has. They come in
// tiers: level 1, 3, and 6. Most add dice to specific rolls.
// Some modify derived stats (Will, Resist, stat caps).
// ─────────────────────────────────────────────
export class AbilityData extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {

      description:   new HTMLField({ required: false, initial: "" }),
      // Text for the "Outside the Action" sidebar, if any
      outsideAction: new HTMLField({ required: false, initial: "" }),

      // Tier at which this ability becomes available (1, 3, or 6)
      abilityLevel: new NumberField({
        required: true, integer: true, initial: 1,
        choices: [1, 3, 6]
      }),

      // Prerequisite text (free-form; some are stat thresholds, some are other abilities)
      prerequisite: new StringField({ required: false, initial: "" }),

      // Whether this ability can be taken more than once
      // (Stat Increase, Signature Move explicitly allow this)
      repeatable: new BooleanField({ initial: false }),

      // ── Dice Bonus ───────────────────────────
      // Many abilities add a flat number of d6 to specific rolls.
      // We track the bonus and what roll type it applies to.
      diceBonus: new SchemaField({
        amount: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
        // Which roll type benefits: "any" | "attack" | "melee" | "ranged"
        //   | "hide" | "manipulate" | "observe" | "specific" | "none"
        rollType: new StringField({ required: true, initial: "none" }),
        // Free-text note for complex conditions ("when making Finesse melee attack", etc.)
        condition: new StringField({ required: false, initial: "" }),
      }),

      // ── Stat Modifications ───────────────────
      // Some abilities change stat values or derived stat calculation.
      statMods: new SchemaField({
        // Direct stat increases (e.g. Stat Increase: +1 to chosen stat)
        physique: new NumberField({ integer: true, initial: 0 }),
        finesse:  new NumberField({ integer: true, initial: 0 }),
        stamina:  new NumberField({ integer: true, initial: 0 }),
        acuity:   new NumberField({ integer: true, initial: 0 }),
        presence: new NumberField({ integer: true, initial: 0 }),

        // Resist calculation multipliers
        // Thick Skin: physiqueMult = 2
        // Unstoppable: physiqueMult = 4
        // Determined Resistance: acuityMult = 2
        // Mental Fortitude: acuityMult = 4
        physiqueMult: new NumberField({ integer: true, min: 1, initial: 1 }),
        acuityMult:   new NumberField({ integer: true, min: 1, initial: 1 }),

        // Flat Will bonus (Battle Scars: +5)
        willBonus:    new NumberField({ integer: true, initial: 0 }),

        // Stat cap override (Enhanced Stat sets cap to 7, Supreme Stat to 8)
        statCapOverride: new NumberField({ integer: true, min: 6, initial: 6 }),
        statCapTarget: new StringField({ required: false, initial: "" }),
      }),

      // ── Movement Override ────────────────────
      // Speedster: movement = 24; Supersonic: movement = 32
      // 0 = no override
      movementOverride: new NumberField({ integer: true, min: 0, initial: 0 }),

      // ── Special Flags ────────────────────────
      // Flags that trigger special system behaviour
      flags: new SchemaField({
        grantsFly:         new BooleanField({ initial: false }),
        grantsTelepathy:   new BooleanField({ initial: false }),
        grantsTelekinesis: new BooleanField({ initial: false }),
        // Ability also grants another level-1 ability (Genius Invention, Heroic Artifact, etc.)
        grantsExtraAbility: new BooleanField({ initial: false }),
        // Automatically succeed on Hide rolls (Cloaking: 1 auto success; Shadow Walker: 2; Shadow Master: 3)
        autoSuccessOnHide: new NumberField({ integer: true, min: 0, initial: 0 }),
        // Seer / Clairvoyant / Oracle: number of uses per episode
        seerUsesPerEpisode: new NumberField({ integer: true, min: 0, initial: 0 }),
        // Survivor / Regeneration: once-per-episode death prevention
        deathPrevention:    new BooleanField({ initial: false }),
      }),

      // ── Uses / Frequency ─────────────────────
      uses: new SchemaField({
        // "unlimited" | "episode" | "scene" | "turn" | "day"
        per:     new StringField({ initial: "unlimited" }),
        max:     new NumberField({ integer: true, min: 0, initial: 0 }),
        current: new NumberField({ integer: true, min: 0, initial: 0 }),
      }),
    };
  }

  static migrateData(source) {
    return super.migrateData(source);
  }

  prepareDerivedData() {
    super.prepareDerivedData();
    // Clamp current uses
    if (this.uses.max > 0) {
      this.uses.current = Math.min(this.uses.current, this.uses.max);
    }
  }

  get hasUses() { return this.uses.max > 0; }
  get isExhausted() { return this.hasUses && this.uses.current <= 0; }
}

// ─────────────────────────────────────────────
//  TalentData  (Item type: "talent")
// ─────────────────────────────────────────────
// Talents are archetype-specific. Each archetype has
// level 1 talents (choose 2) and level 4 talents (choose 1 + 1 free).
// Some talents (Cross-Training) pull from other archetypes.
// ─────────────────────────────────────────────
export class TalentData extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {

      description: new HTMLField({ required: false, initial: "" }),

      // Which archetype this talent belongs to
      archetype: new StringField({
        required: true,
        initial: "",
        choices: [
          "acrobat", "brawler", "commander", "defender",
          "facilitator", "hunter", "strategist", "striker", "any"
        ]
      }),

      // Level at which this talent is available (1 or 4)
      talentLevel: new NumberField({
        required: true, integer: true, initial: 1,
        choices: [1, 4]
      }),

      prerequisite: new StringField({ required: false, initial: "" }),

      // ── Dice Bonus (same structure as AbilityData) ────────────────────────
      diceBonus: new SchemaField({
        amount:    new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
        rollType:  new StringField({ required: true, initial: "none" }),
        condition: new StringField({ required: false, initial: "" }),
      }),

      // ── Flat Will Bonus (Battle Scars: +5) ───────────────────────────────
      willBonus: new NumberField({ integer: true, initial: 0 }),

      // ── Uses / Frequency ─────────────────────
      uses: new SchemaField({
        per:     new StringField({ initial: "unlimited" }),
        max:     new NumberField({ integer: true, min: 0, initial: 0 }),
        current: new NumberField({ integer: true, min: 0, initial: 0 }),
      }),

      // Cross-Training: this talent was taken from another archetype
      isCrossTraining: new BooleanField({ initial: false }),
      sourceArchetype: new StringField({ required: false, initial: "" }),
    };
  }

  static migrateData(source) {
    return super.migrateData(source);
  }

  prepareDerivedData() {
    super.prepareDerivedData();
    if (this.uses.max > 0) {
      this.uses.current = Math.min(this.uses.current, this.uses.max);
    }
  }

  get hasUses() { return this.uses.max > 0; }
  get isExhausted() { return this.hasUses && this.uses.current <= 0; }
}

// ─────────────────────────────────────────────
//  GearData  (Item type: "gear")
// ─────────────────────────────────────────────
// Gear adds d6 to dice pools: improvised=1, right tool=2, specialized=3.
// Defensive gear adds to Resist score instead.
// Unique gear (Appendix B) may also grant abilities or stat changes.
// ─────────────────────────────────────────────
export class GearData extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {

      description: new HTMLField({ required: false, initial: "" }),

      // Gear dice value: 1 (improvised) | 2 (right tool) | 3 (specialized)
      gearDice: new NumberField({
        required: true, integer: true, min: 1, max: 3, initial: 2
      }),

      // Is this defensive gear? (adds to Resist instead of attack pool)
      isDefensive: new BooleanField({ initial: false }),

      // Is this a Heroic Artifact / Villainous Artifact / unique item?
      isArtifact: new BooleanField({ initial: false }),

      // Prerequisite (e.g. Telepathic Crown requires Telepathy ability)
      prerequisite: new StringField({ required: false, initial: "" }),

      // Attack range if used as a weapon
      range: new StringField({
        required: false, initial: "near",
        choices: ["close", "near", "far", "distant", ""]
      }),

      // ── Stat Modifications (for unique gear like Herculean Bracers) ───────
      statMods: new SchemaField({
        physique: new NumberField({ integer: true, initial: 0 }),
        finesse:  new NumberField({ integer: true, initial: 0 }),
        stamina:  new NumberField({ integer: true, initial: 0 }),
        acuity:   new NumberField({ integer: true, initial: 0 }),
        presence: new NumberField({ integer: true, initial: 0 }),
      }),

      // Grants an ability (e.g. Marathon Boots → Speedster, +1 Stamina)
      grantsAbility: new StringField({ required: false, initial: "" }),

      // Additional dice bonus for specific rolls (Telepathic Crown: +2d6 to Telepathy)
      diceBonus: new SchemaField({
        amount:    new NumberField({ integer: true, min: 0, initial: 0 }),
        condition: new StringField({ required: false, initial: "" }),
      }),

      // Equipped state
      equipped: new BooleanField({ initial: true }),
    };
  }

  static migrateData(source) {
    return super.migrateData(source);
  }

  prepareDerivedData() {
    super.prepareDerivedData();
  }

  /** Label for the gear dice value. */
  get gearDiceLabel() {
    return ["", "Improvised (1d6)", "Right Tool (2d6)", "Specialized (3d6)"][this.gearDice] ?? "";
  }
}

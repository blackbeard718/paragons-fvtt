const {
  HTMLField,
  SchemaField,
  NumberField,
  StringField,
  ArrayField,
  BooleanField,
} = foundry.data.fields;

// ─────────────────────────────────────────────
//  NpcData  (NPC / Creature / Villain Actor)
// ─────────────────────────────────────────────
// NPCs don't go through the full character creation process.
// Their stats are set directly per the power rating guidelines.
// Power ratings 0–7; stat totals, will+resist totals, and
// dice pool maxes are defined in the rulebook (p.108).
// ─────────────────────────────────────────────
export class NpcData extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {

      // ── Identity ─────────────────────────────
      description:  new HTMLField({ required: false, initial: "" }),
      secretId:     new StringField({ required: false, initial: "" }),

      // NPC role category for sheet organisation
      npcType: new StringField({
        required: true,
        initial: "antagonist",
        choices: ["antagonist", "creature", "hero", "villain"]
      }),

      // ── Power Rating (0–7) ────────────────────
      powerRating: new NumberField({
        required: true, integer: true, min: 0, max: 7, initial: 1
      }),

      // ── Stats ─────────────────────────────────
      stats: new SchemaField({
        physique: new NumberField({ required: true, integer: true, min: 0, initial: 2 }),
        finesse:  new NumberField({ required: true, integer: true, min: 0, initial: 2 }),
        stamina:  new NumberField({ required: true, integer: true, min: 0, initial: 2 }),
        acuity:   new NumberField({ required: true, integer: true, min: 0, initial: 2 }),
        presence: new NumberField({ required: true, integer: true, min: 0, initial: 2 }),
      }),

      // ── Will ──────────────────────────────────
      will: new SchemaField({
        value: new NumberField({ required: true, integer: true, min: 0, initial: 5 }),
        max:   new NumberField({ required: true, integer: true, min: 0, initial: 5 }),
      }),

      // ── Resist Score ──────────────────────────
      resist: new SchemaField({
        value: new NumberField({ required: true, integer: true, min: 0, initial: 5 }),
        max:   new NumberField({ required: true, integer: true, min: 0, initial: 5 }),
      }),

      // ── Dice Pool Maximum ─────────────────────
      // For quick reference during play; set per power rating.
      // PR0=4d6, PR1=8d6, PR2=10d6, PR3=12d6, PR4=15d6,
      // PR5=20d6, PR6=25d6, PR7=30d6
      dicePoolMax: new NumberField({
        required: true, integer: true, min: 1, initial: 8
      }),

      // ── Movement ─────────────────────────────
      movement: new NumberField({ required: true, integer: true, min: 0, initial: 8 }),

      // ── Traits (Agenda / Motive / Flaw) ──────
      traits: new SchemaField({
        agenda: new StringField({ required: false, initial: "" }),
        motive: new StringField({ required: false, initial: "" }),
        flaw:   new StringField({ required: false, initial: "" }),
      }),

      // ── Attack Moves (free-text list for GM reference) ───────────────────
      // Each entry: { label, stat, bonus, range, description }
      attackMoves: new ArrayField(
        new SchemaField({
          label:       new StringField({ required: true, initial: "Attack" }),
          stat:        new StringField({ required: true, initial: "physique",
            choices: ["physique", "finesse", "stamina", "acuity", "presence"] }),
          dicePool:    new NumberField({ required: true, integer: true, min: 1, initial: 4 }),
          range:       new StringField({ required: false, initial: "near",
            choices: ["close", "near", "far", "distant"] }),
          description: new StringField({ required: false, initial: "" }),
        })
      ),

      // ── Is human? (affects effective power rating per rulebook p.109) ────
      isHuman: new BooleanField({ initial: false }),

    };
  }

  static migrateData(source) {
    return super.migrateData(source);
  }

  prepareBaseData() {
    super.prepareBaseData();
  }

  prepareDerivedData() {
    super.prepareDerivedData();

    // For NPCs, Will and Resist are set directly by the GM.
    // Clamp current values to max in case max was reduced.
    this.will.value   = Math.min(this.will.value,   this.will.max);
    this.resist.value = Math.min(this.resist.value, this.resist.max);

    // Effective power rating: humans without abilities are -1
    this.effectivePowerRating = this.isHuman
      ? Math.max(0, this.powerRating - 1)
      : this.powerRating;
  }

  // ─── Convenience getters ────────────────────

  get isKnockedOut() { return this.will.value <= 0; }

  get isDying() {
    return this.parent?.getFlag("paragons", "dying") ?? false;
  }

  /**
   * Reference table for power rating stat caps.
   * Returns the guidelines for the NPC's current power rating.
   */
  get powerRatingGuidelines() {
    const table = [
      { dicePoolMax: 4,  maxStatTotal: 12, maxWillResistTotal: 8,  abilityGearTotal: 0 },
      { dicePoolMax: 8,  maxStatTotal: 16, maxWillResistTotal: 12, abilityGearTotal: 1 },
      { dicePoolMax: 10, maxStatTotal: 20, maxWillResistTotal: 20, abilityGearTotal: 2 },
      { dicePoolMax: 12, maxStatTotal: 22, maxWillResistTotal: 28, abilityGearTotal: 3 },
      { dicePoolMax: 15, maxStatTotal: 26, maxWillResistTotal: 35, abilityGearTotal: 3 },
      { dicePoolMax: 20, maxStatTotal: 30, maxWillResistTotal: 40, abilityGearTotal: 4 },
      { dicePoolMax: 25, maxStatTotal: 32, maxWillResistTotal: 50, abilityGearTotal: 5 },
      { dicePoolMax: 30, maxStatTotal: 36, maxWillResistTotal: 60, abilityGearTotal: 6 },
    ];
    return table[this.powerRating] ?? table[0];
  }

  /** Current stat total — useful for GM to compare against power rating caps. */
  get statTotal() {
    const s = this.stats;
    return s.physique + s.finesse + s.stamina + s.acuity + s.presence;
  }

  get willResistTotal() {
    return this.will.max + this.resist.max;
  }
}

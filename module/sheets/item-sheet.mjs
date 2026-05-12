/**
 * sheets/item-sheet.mjs
 * Handles ability, talent, and gear item sheets.
 */

export class ParagonsItemSheet extends ItemSheet {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["paragons", "sheet", "item"],
      width:   520,
      height:  580,
      tabs: [],
    });
  }

  /** Route template by item type. */
  get template() {
    return `systems/paragons/templates/item/${this.item.type}-sheet.hbs`;
  }

  async getData(options = {}) {
    const context = await super.getData(options);
    const system  = this.item.system;

    // Stat mod fields for ability/gear sheets
    context.statModFields = [
      { key: "physique", label: "Physique", value: system.statMods?.physique ?? 0 },
      { key: "finesse",  label: "Finesse",  value: system.statMods?.finesse  ?? 0 },
      { key: "stamina",  label: "Stamina",  value: system.statMods?.stamina  ?? 0 },
      { key: "acuity",   label: "Acuity",   value: system.statMods?.acuity   ?? 0 },
      { key: "presence", label: "Presence", value: system.statMods?.presence ?? 0 },
    ];

    // Archetype choices for talent sheet
    context.archetypeChoices = [
      "acrobat","brawler","commander","defender",
      "facilitator","hunter","strategist","striker"
    ].map(a => ({
      value:    a,
      label:    a.charAt(0).toUpperCase() + a.slice(1),
      selected: system.archetype === a,
    }));

    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);
  }

  async _updateObject(event, formData) {
    return this.item.update(formData);
  }
}

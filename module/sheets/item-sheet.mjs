/**
 * sheets/item-sheet.mjs
 * Paragons Item Sheet — ItemSheetV2 (Foundry V13)
 */

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 }                = foundry.applications.sheets;

export class ParagonsItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["paragons", "sheet", "item"],
    position: { width: 520, height: 580 },
    window:   { resizable: true },
    form: {
      submitOnChange: true,
      closeOnSubmit:  false,
    },
  };

  static PARTS = {
    form: {
      template: "", // set dynamically in _configureRenderOptions
    },
  };

  // Route template by item type
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    options.parts = ["form"];
    this.constructor.PARTS.form = {
      template: `systems/paragons/templates/item/${this.item.type}-sheet.hbs`,
    };
    return options;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const sys = this.item.system;

    context.item   = this.item;
    context.system = sys;
    context.flags  = this.item.flags;

    context.statModFields = [
      { key: "physique", label: "Physique", value: sys.statMods?.physique ?? 0 },
      { key: "finesse",  label: "Finesse",  value: sys.statMods?.finesse  ?? 0 },
      { key: "stamina",  label: "Stamina",  value: sys.statMods?.stamina  ?? 0 },
      { key: "acuity",   label: "Acuity",   value: sys.statMods?.acuity   ?? 0 },
      { key: "presence", label: "Presence", value: sys.statMods?.presence ?? 0 },
    ];

    context.archetypeChoices = [
      "acrobat","brawler","commander","defender",
      "facilitator","hunter","strategist","striker",
    ].map(a => ({
      value: a, label: a.charAt(0).toUpperCase() + a.slice(1),
      selected: sys.archetype === a,
    }));

    return context;
  }
}

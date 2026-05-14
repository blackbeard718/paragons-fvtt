/**
 * sheets/item-sheet.mjs
 * Paragons Item Sheet — ItemSheetV2 (Foundry V13)
 *
 * V13 requires PARTS to be statically defined per class.
 * We solve this with three separate sheet classes, one per item type,
 * all sharing the same _prepareContext and logic.
 */

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 }                = foundry.applications.sheets;

// ─── Shared base ─────────────────────────────────────────────────────────────

class ParagonsItemSheetBase extends HandlebarsApplicationMixin(ItemSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["paragons", "sheet", "item"],
    position: { width: 520, height: 580 },
    window:   { resizable: true },
    tag: "form",
    form: {
      submitOnChange: true,
      closeOnSubmit:  false,
    },
  };

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

  // Portrait / image click handler
  _attachPartListeners(partId, htmlElement, options) {
    super._attachPartListeners(partId, htmlElement, options);
    htmlElement.querySelectorAll("[data-edit-img]").forEach(el => {
      el.addEventListener("click", async () => {
        const fp = new FilePicker({
          type:     "image",
          current:  this.item.img,
          callback: async (path) => {
            await this.item.update({ img: path });
          },
        });
        fp.render(true);
      });
    });
  }
}

// ─── Ability Sheet ────────────────────────────────────────────────────────────

export class ParagonsAbilitySheet extends ParagonsItemSheetBase {
  static PARTS = {
    form: {
      id:       "form",
      template: "systems/paragons/templates/item/ability-sheet.hbs",
      scrollable: [".item-body"],
    },
  };
}

// ─── Talent Sheet ─────────────────────────────────────────────────────────────

export class ParagonstTalentSheet extends ParagonsItemSheetBase {
  static PARTS = {
    form: {
      id:       "form",
      template: "systems/paragons/templates/item/talent-sheet.hbs",
      scrollable: [".item-body"],
    },
  };
}

// ─── Gear Sheet ───────────────────────────────────────────────────────────────

export class ParagonsGearSheet extends ParagonsItemSheetBase {
  static PARTS = {
    form: {
      id:       "form",
      template: "systems/paragons/templates/item/gear-sheet.hbs",
      scrollable: [".item-body"],
    },
  };
}

// Keep a generic export for any code that imports ParagonsItemSheet by name
export { ParagonsAbilitySheet as ParagonsItemSheet };

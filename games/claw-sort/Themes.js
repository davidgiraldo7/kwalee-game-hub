/* The Claw — environment themes.
   Cycle with the 1-based level number: L1 = themes[0], L2 = themes[1], then wrap.
   Controls background, cabinet frame, well fill (backWall), bevel, and conveyor.
   Balls and trays stay paletted. */

(function (root) {
  "use strict";

  var DEFAULT_THEMES = [
    {
      id: "puzzleViolet",
      name: "Puzzle Violet",
      background: { center: "#B56FDB", mid: "#9B5DC8", edge: "#7E46B0" },
      floor: "#C9C2D6",
      walls: "#6B3A96",
      backWall: "#C4B6DD",
      frame: "#9B5DC8",
      bevel: "#5E2F88",
      lip: "#B57AE0",
      conveyor: {
        belt: "#454A56",
        roller: "#6C768C",
        slot: "#A0ABB8",
        slotRim: "#989EAB"
      }
    },
    {
      id: "dustyRose",
      name: "Dusty Rose",
      background: { center: "#C46B7A", mid: "#B05B6B", edge: "#944A58" },
      floor: "#E6E9F5",
      walls: "#8A4452",
      backWall: "#F1C4CD",
      frame: "#DD637D",
      bevel: "#7A3B48",
      lip: "#C97886",
      conveyor: {
        belt: "#454A56",
        roller: "#6C768C",
        slot: "#A0ABB8",
        slotRim: "#989EAB"
      }
    },
    {
      id: "warmWalnut",
      name: "Warm Walnut",
      background: { center: "#BC8E62", mid: "#A67C52", edge: "#8D6844" },
      floor: "#E5E9EC",
      walls: "#8B6343",
      backWall: "#E9CBAC",
      frame: "#DC954F",
      bevel: "#7A5638",
      lip: "#C0946A",
      conveyor: {
        belt: "#454A56",
        roller: "#6C768C",
        slot: "#A0ABB8",
        slotRim: "#989EAB"
      }
    },
    {
      id: "slateArcade",
      name: "Slate Arcade",
      background: { center: "#6A80A4", mid: "#556B8D", edge: "#3E5270" },
      floor: "#D4DCE8",
      walls: "#3D5178",
      backWall: "#B0BFD6",
      frame: "#5E81B8",
      bevel: "#3A4C6C",
      lip: "#7A90B0",
      conveyor: {
        belt: "#454A56",
        roller: "#6C768C",
        slot: "#A0ABB8",
        slotRim: "#989EAB"
      }
    }
  ];

  function Themes(themes) {
    this.themes = (themes && themes.length) ? themes.slice() : DEFAULT_THEMES.slice();
  }

  Themes.prototype.count = function () {
    return this.themes.length;
  };

  Themes.prototype.get = function (index) {
    var n = this.themes.length;
    if (!n) return null;
    var i = ((index % n) + n) % n;
    return this.themes[i];
  };

  /** @param {number} level 1-based level number */
  Themes.prototype.forLevel = function (level) {
    var lv = level | 0;
    if (lv < 1) lv = 1;
    return this.get(lv - 1);
  };

  Themes.prototype.indexForLevel = function (level) {
    var n = this.themes.length;
    if (!n) return 0;
    var lv = level | 0;
    if (lv < 1) lv = 1;
    return ((lv - 1) % n + n) % n;
  };

  Themes.DEFAULTS = DEFAULT_THEMES;

  root.Themes = Themes;
  root.clawThemes = new Themes(DEFAULT_THEMES);
})(typeof window !== "undefined" ? window : this);

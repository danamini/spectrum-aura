import * as React from "react";

/**
 * How the panel is being read right now. While searching, collapsed sections
 * open so their controls can be found. With `activeOnly`, effect sections show
 * only the effects that are switched on, so the list is as long as what is in
 * use rather than as long as everything that exists.
 */
export const PanelFilterContext = React.createContext<{
  searching: boolean;
  activeOnly: boolean;
  inEffectSection: boolean;
}>({ searching: false, activeOnly: false, inEffectSection: false });

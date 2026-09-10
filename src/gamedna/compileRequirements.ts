/**
 * Native port of content-gamedna-lab's `compile-requirements.mjs` (removed --
 * this is now the one implementation, no external script). Deterministic:
 * reads one `.gflow`-shaped object, derives a `requirements[]` list via fixed
 * rules, no LLM. Same rule set, same output shape, same "first rule wins" /
 * "Eigenschaft != System" ("Inference Budget") discipline as the original.
 */

export interface Requirement {
  id: string;
  capability: string;
  sourceKey: string;
  quantity?: number;
  features?: unknown;
  dependencies?: string[];
  outputs?: string[];
}

type Fgame = Record<string, any>;

function has(fgame: Fgame, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(fgame, key) && fgame[key] != null;
}
function arrLen(fgame: Fgame, key: string): number {
  return has(fgame, key) && Array.isArray(fgame[key]) ? fgame[key].length : 0;
}
function truthyKeys(obj: Record<string, unknown> | undefined | null): string[] {
  return Object.entries(obj ?? {}).filter(([, v]) => v === true).map(([k]) => k);
}

export function compileRequirements(fgame: Fgame): Requirement[] {
  const requirements: Requirement[] = [];
  const capabilitiesSeen = new Set<string>();
  let seq = 0;

  function add(capability: string, sourceKey: string, opts: Partial<Requirement> = {}): string | undefined {
    // Dieselbe Capability nie zweimal fordern -- passiert vor allem, wenn ein
    // generisches `systems[]`-Eintrag (z.B. "interaction_system") dasselbe
    // nochmal behauptet, was schon ueber ein Domaenenfeld (z.B.
    // gameplay.interactions) abgeleitet wurde. Erste Regel gewinnt.
    if (capabilitiesSeen.has(capability)) return undefined;
    capabilitiesSeen.add(capability);
    seq += 1;
    const id = `REQ-${String(seq).padStart(3, '0')}-${capability.toUpperCase()}`;
    requirements.push({ id, capability, sourceKey, ...opts });
    return id;
  }

  // -- Actors / Charaktersteuerung --------------------------------------------
  let characterControllerId: string | undefined;
  if (has(fgame, 'game.camera') && ['first_person', 'third_person'].includes(fgame['game.camera'])) {
    characterControllerId = add('character_controller', 'game.camera', { features: [fgame['game.camera']] });
  }
  if (has(fgame, 'actors.player')) {
    add('player_controller', 'actors.player', {
      dependencies: characterControllerId ? [characterControllerId] : undefined,
      features: fgame['actors.player']?.abilities ?? undefined,
    });
  }
  if (arrLen(fgame, 'actors.characters') > 0) {
    add('npc_character_generation', 'actors.characters', {
      quantity: arrLen(fgame, 'actors.characters'),
      dependencies: characterControllerId ? [characterControllerId] : undefined,
      outputs: ['character.lua'],
    });
  }
  let enemyAiId: string | undefined;
  if (arrLen(fgame, 'actors.enemies') > 0) {
    enemyAiId = add('enemy_ai', 'actors.enemies', {
      quantity: arrLen(fgame, 'actors.enemies'),
      dependencies: characterControllerId ? [characterControllerId] : undefined,
      outputs: ['enemy_ai.lua'],
    });
  }
  if (arrLen(fgame, 'actors.teams') > 0) {
    add('team_system', 'actors.teams', { quantity: arrLen(fgame, 'actors.teams') });
  }

  // -- Gameplay -----------------------------------------------------------
  let weaponSystemId: string | undefined;
  if (arrLen(fgame, 'gameplay.weapons') > 0) {
    weaponSystemId = add('weapon_system', 'gameplay.weapons', {
      quantity: arrLen(fgame, 'gameplay.weapons'),
      dependencies: characterControllerId ? [characterControllerId] : undefined,
      outputs: ['weapon.lua'],
    });
  }
  if (has(fgame, 'gameplay.movement')) {
    const features = truthyKeys(fgame['gameplay.movement']);
    if (features.length > 0) add('movement_system', 'gameplay.movement', { features });
  }
  if (has(fgame, 'gameplay.combat')) {
    const deps = [weaponSystemId, characterControllerId].filter(Boolean) as string[];
    add('combat_system', 'gameplay.combat', {
      dependencies: deps.length > 0 ? deps : undefined,
      features: fgame['gameplay.combat']?.type ? [fgame['gameplay.combat'].type] : undefined,
    });
  }
  if (has(fgame, 'gameplay.interaction') || has(fgame, 'gameplay.interactions')) {
    const features = [
      ...truthyKeys(fgame['gameplay.interaction']),
      ...Object.keys(fgame['gameplay.interactions'] ?? {}),
    ];
    if (features.length > 0) add('interaction_system', 'gameplay.interaction|gameplay.interactions', { features: [...new Set(features)] });
  }
  if (arrLen(fgame, 'gameplay.abilities') > 0) {
    add('ability_system', 'gameplay.abilities', { quantity: arrLen(fgame, 'gameplay.abilities') });
  }

  // -- Items / Inventar -----------------------------------------------------
  const itemKeys = ['items.equipment', 'items.consumables', 'items.resources', 'items.collectibles'];
  const presentItemKeys = itemKeys.filter((k) => arrLen(fgame, k) > 0);
  if (presentItemKeys.length > 0) {
    add('inventory_system', 'items.*', {
      quantity: presentItemKeys.reduce((sum, k) => sum + arrLen(fgame, k), 0),
      features: presentItemKeys,
    });
  }

  // -- World ----------------------------------------------------------------
  // world_streaming braucht MEHRERE Maps (oder explizit scale.world
  // large/massive) -- genau EINE Map laden ist Basis-Engine-Funktionalitaet
  // (frost.loadScene(uri)), keine Lab-Capability. NIE aus world.maps[].properties
  // (z.B. timeOfDay/weather) -- eine Eigenschaft ist keine Systemanforderung.
  const mapCount = arrLen(fgame, 'world.maps');
  if (mapCount > 1 || ['large', 'massive'].includes(fgame['scale.world'])) {
    add('world_streaming', 'world.maps', {
      quantity: mapCount,
      features: has(fgame, 'scale.world') ? [fgame['scale.world']] : undefined,
    });
  }
  if (arrLen(fgame, 'world.levels') > 0) {
    add('level_generation', 'world.levels', { quantity: arrLen(fgame, 'world.levels') });
  }

  // -- Progression / Economy / Missions --------------------------------------
  if (arrLen(fgame, 'progression.graphs') > 0) {
    add('progression_system', 'progression.graphs', { quantity: arrLen(fgame, 'progression.graphs') });
  }
  const economyKeys = ['economy.currencies', 'economy.vendors', 'economy.crafting', 'economy.rewards'];
  const presentEconomyKeys = economyKeys.filter((k) => arrLen(fgame, k) > 0);
  if (presentEconomyKeys.length > 0) {
    add('economy_system', 'economy.*', { features: presentEconomyKeys });
  }
  let objectivesId: string | undefined;
  if (arrLen(fgame, 'gameplay.objectives') > 0) {
    objectivesId = add('objective_tracking', 'gameplay.objectives', { quantity: arrLen(fgame, 'gameplay.objectives') });
  }
  if (arrLen(fgame, 'missions') > 0) {
    add('mission_system', 'missions', {
      quantity: arrLen(fgame, 'missions'),
      dependencies: objectivesId ? [objectivesId] : undefined,
      outputs: ['mission.lua'],
    });
  }

  // -- AI / Narrative / Social ------------------------------------------------
  if (arrLen(fgame, 'ai.behaviors') > 0) {
    add('ai_director', 'ai.behaviors', {
      quantity: arrLen(fgame, 'ai.behaviors'),
      dependencies: enemyAiId ? [enemyAiId] : undefined,
    });
  }
  if (has(fgame, 'narrative.premise') || arrLen(fgame, 'narrative.arcs') > 0) {
    add('dialogue_narrative_system', 'narrative.*', {
      quantity: arrLen(fgame, 'narrative.arcs') || undefined,
    });
  }
  if (arrLen(fgame, 'social.features') > 0) {
    add('social_system', 'social.features', { features: fgame['social.features'] });
  }

  // -- Multiplayer / Live Service ---------------------------------------------
  const anyModeMultiplayer = Array.isArray(fgame['modes']) && fgame['modes'].some((m: any) => (m?.maxPlayers ?? 1) > 1);
  if (fgame['scale.multiplayer'] === true || anyModeMultiplayer) {
    add('multiplayer_netcode', 'scale.multiplayer', {
      features: has(fgame, 'technical.networking') ? [fgame['technical.networking']?.model].filter(Boolean) : undefined,
    });
  }
  if (fgame['scale.liveService'] === true || arrLen(fgame, 'liveService.seasons') > 0 || arrLen(fgame, 'liveService.events') > 0) {
    add('live_service_backend', 'scale.liveService', {
      features: [arrLen(fgame, 'liveService.seasons') > 0 && 'seasons', arrLen(fgame, 'liveService.events') > 0 && 'events'].filter(Boolean) as string[],
    });
  }

  // -- Asset-Generierung (technikoffen) ------------
  if (arrLen(fgame, 'assets.generation') > 0) {
    const kinds = [...new Set(fgame['assets.generation'].map((a: any) => a?.kind).filter(Boolean))];
    add('asset_generation', 'assets.generation', {
      quantity: arrLen(fgame, 'assets.generation'),
      features: kinds,
      // Bewusst KEIN 'technique'-Feature -- ob ein Eintrag als Bild oder 3D-Mesh
      // erzeugt wird, entscheidet die Content-Pipeline, nicht dieses Requirement.
    });
  }

  // -- Presentation -------------------------------------------------------
  if (has(fgame, 'presentation.visual') || has(fgame, 'presentation.vfx')) add('vfx_pipeline', 'presentation.visual|presentation.vfx');
  if (has(fgame, 'presentation.audio')) add('audio_pipeline', 'presentation.audio');
  if (has(fgame, 'presentation.ui')) add('ui_system', 'presentation.ui');

  // -- Zustaende / Interaktionen / Platzierung / Physik / Animation / Raum ----
  if (arrLen(fgame, 'states') > 0) {
    add('state_machine_system', 'states', { quantity: arrLen(fgame, 'states') });
  }
  let reactionSystemId: string | undefined;
  if (arrLen(fgame, 'reactions') > 0) {
    reactionSystemId = add('reaction_system', 'reactions', {
      quantity: arrLen(fgame, 'reactions'),
      outputs: ['reactions.lua'],
    });
  }
  if (arrLen(fgame, 'placements') > 0) {
    add('placement_lifecycle_system', 'placements', {
      quantity: arrLen(fgame, 'placements'),
      dependencies: reactionSystemId ? [reactionSystemId] : undefined,
    });
  }
  if (arrLen(fgame, 'physics') > 0) {
    add('physics_system', 'physics', { quantity: arrLen(fgame, 'physics') });
  }
  if (arrLen(fgame, 'animationSets') > 0) {
    add('animation_system', 'animationSets', { quantity: arrLen(fgame, 'animationSets') });
  }
  if (arrLen(fgame, 'spatial') > 0) {
    add('spatial_interaction_system', 'spatial', { quantity: arrLen(fgame, 'spatial') });
  }

  // -- UI als Spielsystem (Screen-Space + World-Space) -------------------------
  if (fgame['ui.hud']?.enabled) {
    add('hud_system', 'ui.hud', { features: fgame['ui.hud']?.elements });
  }
  if (fgame['ui.buildingPlacement']?.enabled) {
    add('building_placement_ui', 'ui.buildingPlacement', {
      dependencies: reactionSystemId ? [reactionSystemId] : undefined,
      features: fgame['ui.buildingPlacement']?.states,
    });
  }
  if (fgame['ui.inventory']?.enabled) {
    add('inventory_ui', 'ui.inventory', {
      features: Object.keys(fgame['ui.inventory']?.features ?? {}).filter((k) => fgame['ui.inventory'].features[k]),
    });
  }
  if (fgame['ui.worldUI']?.unitOverlays?.enabled || fgame['ui.worldUI']?.icons?.enabled) {
    add('world_ui_overlay_system', 'ui.worldUI', {
      quantity: fgame['ui.worldUI']?.unitOverlays?.elements?.length || undefined,
      features: fgame['ui.worldUI']?.icons?.types,
    });
  }
  if (fgame['ui.debug']?.enabled) {
    add('debug_tools', 'ui.debug', { features: fgame['ui.debug']?.panels });
  }

  // -- Visual-Generation-Pipeline / Build-Staging ------------------------------
  // NUR aus echten Profilen (mehrere benannte Qualitaetsstufen), NIE aus dem
  // blossen Skalar visualGeneration.quality -- der ist ein Build-Parameter,
  // kein Spielsystem (Inference Budget).
  if (has(fgame, 'visualGeneration.profiles')) {
    add('visual_generation_pipeline', 'visualGeneration.profiles', {
      features: Object.keys(fgame['visualGeneration.profiles']),
    });
  }
  if (arrLen(fgame, 'build.stages') > 0) {
    add('build_pipeline', 'build.stages', {
      quantity: arrLen(fgame, 'build.stages'),
      features: [...new Set(fgame['build.stages'].map((s: any) => s?.quality).filter(Boolean))],
    });
  }
  if (has(fgame, 'testProfiles')) {
    add('vertical_slice_testing', 'testProfiles', { features: Object.keys(fgame['testProfiles']) });
  }
  if (Array.isArray(fgame['validationStrategy']?.stages) && fgame['validationStrategy'].stages.length > 0) {
    add('incremental_validation_strategy', 'validationStrategy', {
      quantity: fgame['validationStrategy'].stages.length,
      features: [...new Set(fgame['validationStrategy'].stages.map((s: any) => s?.scope).filter(Boolean))],
    });
  }

  // -- Deterministische Test-Szenarien (kein LLM) ------------------------------
  if (arrLen(fgame, 'scenarios') > 0) {
    const tags = [...new Set(fgame['scenarios'].flatMap((s: any) => s?.tags ?? []))];
    add('scenario_test_runner', 'scenarios', {
      quantity: arrLen(fgame, 'scenarios'),
      features: tags,
      dependencies: reactionSystemId ? [reactionSystemId] : undefined,
    });
  }

  // -- Generic Entity/Component/System/Rule overlay ----------------------------
  // NUR Entities mit einer Komponente ausser 'render' zaehlen -- eine reine
  // Render-Prop (Boden, Cube, Deko) braucht nichts ausser der Basis-Engine.
  const dynamicEntityCount = (fgame['entities'] ?? []).filter(
    (e: any) => Object.keys(e?.components ?? {}).some((k) => k !== 'render'),
  ).length;
  if (dynamicEntityCount > 0) {
    add('entity_component_runtime', 'entities', { quantity: dynamicEntityCount });
  }
  if (Array.isArray(fgame['systems'])) {
    for (const system of fgame['systems']) {
      if (!system?.type || system?.implementation) continue; // schon konkretisiert -- kein offenes Requirement mehr
      add(system.type, `systems[id=${system.id}]`, { quantity: 1 });
    }
  }
  if (arrLen(fgame, 'rules') > 0) {
    add('rule_engine', 'rules', { quantity: arrLen(fgame, 'rules') });
  }

  return requirements;
}

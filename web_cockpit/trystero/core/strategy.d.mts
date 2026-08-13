import { BaseRoomConfig, JoinRoom, JoinRoomConfig, StrategyAdapter } from "./types.mjs";

//#region src/strategy.d.ts
declare const _default: <TRelay, TConfig extends BaseRoomConfig = JoinRoomConfig>({
  init,
  subscribe,
  announce,
  deactivate
}: StrategyAdapter<TRelay, TConfig>) => JoinRoom<TConfig>;
//#endregion
export { _default };
//# sourceMappingURL=strategy.d.mts.map
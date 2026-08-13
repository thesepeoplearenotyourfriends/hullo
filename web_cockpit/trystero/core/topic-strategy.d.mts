import { BaseRoomConfig, JoinRoom, JoinRoomConfig, TopicStrategyAdapter } from "./types.mjs";

//#region src/topic-strategy.d.ts
declare const _default: <TRelay, TConfig extends BaseRoomConfig = JoinRoomConfig>({
  init,
  subscribeTopic,
  publishTopic,
  unpublishTopic
}: TopicStrategyAdapter<TRelay, TConfig>) => JoinRoom<TConfig>;
//#endregion
export { _default };
//# sourceMappingURL=topic-strategy.d.mts.map
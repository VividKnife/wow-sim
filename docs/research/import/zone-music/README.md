# 区域背景音乐

游戏默认开启区域音乐，默认音量 25%，循环播放当前选曲。侧栏提供 0–100% 音量滑块，调节即时生效且不重播，0% 静音；音量及开关偏好保存在浏览器本地，跨区和重新开启音乐时保持。音乐开关独立于战斗音效。浏览器禁止自动播放时，首次点击或按键会重试；页面隐藏时停止，返回时重新播放。音乐只跟随服务端当前位置，同区域移动、轮询和界面切换不会重播。

当前选曲：北郡 / 艾尔文 / 赤脊山及洛克莫丹信使节点使用 Forest；西部荒野使用 BarrenDry；六大主城使用各自城市曲；月光林地使用 EvilForest；进入死亡矿井副本使用该区域音乐列表中的 CursedLand。副本入口仍播放西部荒野。每组暂选一首循环，不复刻完整客户端子区域和昼夜歌单。

来源为 [Wowhead Classic 音乐目录](https://www.wowhead.com/classic/sounds/zone-music)，区域选取参考其 Classic 区域页面（12、40、44、38、493、1581）。`source.html` 保留目录原始响应，`manifest.json` 记录音频来源、文件 ID、源/成品 SHA-256、大小、时长和移除的空字节前缀数量。保留 MP3 音频帧，不重新编码；全部曲目通过 soundfile 完整解码。素材权属属于 Blizzard Entertainment。

重跑导入：`python docs/research/import/import-zone-music.py`（需要 Python、soundfile）。验证映射、素材哈希与播放生命周期：`node --test apps/web/test/zone-music.test.mjs`。

监狱任务路线新增夜色镇与湿地节点：暮色森林选用目录中的 Haunted01（53234），湿地选用 Swamp01（53253）。这是配合区域氛围的循环选曲，不代表原客户端完整区域播放规则；来源与音频校验信息一并记录在清单中。

面向 Paseo 的多服务商语音网关插件。

本插件在 daemon 本机运行一个仅监听 127.0.0.1 的 OpenAI 兼容端点，将 Paseo 的语音功能
路由到多种上游语音服务。由于 Paseo 本身已支持 OpenAI 语音协议，桌面端、网页端、
iOS 与 Android 端的听写行为保持一致。

当前已接入的上游服务：ElevenLabs Scribe（`scribe_v2`、`scribe_v3`）、DeepInfra
（Whisper large-v3、large-v3 turbo 与 Qwen3-ASR 0.6B）和千问 AI（Qwen3-ASR Flash）。每个服务商都是独立的
适配器，后续可扩展更多 STT、TTS 及实时语音对话服务。

工作原理：启用接管后，插件会先保存当前的听写语音设置，再把听写指向本地回环端点
并使用仅存于 daemon 本机的访问 token。如果插件被禁用或移除且听写仍指向本网关，
插件会尝试恢复此前保存的配置。如果你在设置 → 语音中手动改用了其他配置，插件不会
覆盖你的选择。

设置：在 Paseo Voice 页面为所选服务商保存 API key（仅保存在 daemon 本机 0600 权限
文件中，不会回显到客户端），测试连接并配置模型、语言提示等选项后即可启用。插件需要
Paseo 0.15.4 或更高版本并开启插件开关，daemon 所在机器需能访问对应的上游服务。

数据与限制：口述音频会发送给你所选的服务商进行转写，返回的文本像正常打字一样进入
Paseo。ElevenLabs 的音频发往 api.elevenlabs.io，DeepInfra 发往 api.deepinfra.com，千问 AI
发往 maas.qianwenaiapi.com。各服务商的 API key 仅保存在 daemon 本机。次要语言提示与
`transcript_edit`（默认关闭）仅适用于 ElevenLabs Scribe v3；数字格式化适用于 Scribe v3
与千问 AI；DeepInfra 与千问 AI 在设置了主语言时会使用该语言提示。

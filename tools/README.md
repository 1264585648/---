# Tools

## MiniMax TTS

Use `minimax_tts.mjs` to generate narration audio from text or a text file.

Set the API key only in the current shell session:

```powershell
$env:MINIMAX_API_KEY="your_minimax_api_key"
```

For mainland China accounts, use the MiniMaxi endpoint:

```powershell
node tools/minimax_tts.mjs `
  --api-url https://api.minimaxi.com/v1/t2a_v2 `
  --text "这是一段 MiniMax 语音接口测试。" `
  --out assets/audio/minimax_test.mp3
```

For global accounts, the default endpoint is:

```powershell
node tools/minimax_tts.mjs --text "这是一段 MiniMax 语音接口测试。" --out assets/audio/minimax_test.mp3
```

Generate from a finalized narration file:

```powershell
node tools/minimax_tts.mjs `
  --api-url https://api.minimaxi.com/v1/t2a_v2 `
  --input "第一期：拆解token中转站/视频大纲.md" `
  --out assets/audio/narration.mp3
```

Default settings:

- model: `speech-02-hd`
- voice_id: `Chinese (Mandarin)_Reliable_Executive`
- format: `mp3`
- sample_rate: `32000`
- bitrate: `128000`
- channel: `1`

Each run writes the audio file and a metadata JSON file next to it.

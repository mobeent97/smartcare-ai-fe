// TODO: Replace this stub with the real agora-rtc-sdk-ng client when AGORA_APP_ID is available.
// Usage: import AgoraRTC from 'agora-rtc-sdk-ng' and use AgoraRTC.createClient(...)

export class AgoraStub {
  private channel: string;
  private uid: number;

  constructor(_appId: string, channel: string, uid: number) {
    this.channel = channel;
    this.uid = uid;
  }

  async join(_token: string): Promise<void> {
    console.log(`[AgoraStub] TODO: Join channel "${this.channel}" uid=${this.uid}. Wire up agora-rtc-sdk-ng when AGORA_APP_ID is set.`);
  }

  async leave(): Promise<void> {
    console.log(`[AgoraStub] TODO: Leave channel "${this.channel}"`);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  on(_event: string, _handler: (...args: unknown[]) => void): void {
    // no-op until real SDK wired
  }
}

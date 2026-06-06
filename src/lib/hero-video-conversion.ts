import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { appConfig } from './config';
import { getSettingValue, setSettings, type HeroVideo } from './settings';

const mediaRoot = path.resolve(path.dirname(appConfig.databasePath), 'media');
const bannerDir = path.join(mediaRoot, 'banner');
const running = new Set<string>();
const YT_DLP_TIMEOUT_MS = 10 * 60 * 1000;

function isYouTubeUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'youtu.be' || host.endsWith('.youtube.com') || host === 'youtube.com';
  } catch {
    return false;
  }
}

function safeVideoId(video: HeroVideo): string {
  return String(video.id || crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || crypto.randomUUID();
}

function videoHash(url: string): string {
  return crypto.createHash('sha256').update(url).digest('hex').slice(0, 12);
}

function readHeroVideos(raw: string | null): HeroVideo[] {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function updateHeroVideo(videoId: string, patch: Partial<HeroVideo>) {
  const videos = readHeroVideos(await getSettingValue('heroVideos'));
  const next = videos.map((video) => (video.id === videoId ? { ...video, ...patch } : video));
  await setSettings({ heroVideos: next });
}

function runCommand(command: string, args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const output: string[] = [];
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`timeout after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    child.stdout.on('data', (chunk) => output.push(String(chunk)));
    child.stderr.on('data', (chunk) => output.push(String(chunk)));
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(output.join('').trim().slice(-1200) || `${command} exited with ${code}`));
    });
  });
}

async function convertOne(video: HeroVideo) {
  const sourceUrl = video.sourceUrl || video.url;
  if (!isYouTubeUrl(sourceUrl)) return;
  const id = safeVideoId(video);
  const hash = videoHash(sourceUrl);
  const filename = `${id}-${hash}.mp4`;
  const outputPath = path.join(bannerDir, filename);
  const localUrl = `/media/banner/${filename}`;
  const key = `${id}:${hash}`;
  if (running.has(key)) return;
  running.add(key);
  try {
    await fs.mkdir(bannerDir, { recursive: true });
    await updateHeroVideo(video.id, { conversionStatus: 'processing', conversionError: '' });
    await runCommand('yt-dlp', [
      '--ffmpeg-location', '/usr/bin/ffmpeg',
      '-f', 'bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]/best[height<=720]',
      '--merge-output-format', 'mp4',
      '--force-overwrites',
      '-o', outputPath,
      sourceUrl,
    ], YT_DLP_TIMEOUT_MS);
    await updateHeroVideo(video.id, {
      sourceUrl,
      localUrl,
      conversionStatus: 'completed',
      conversionError: '',
      convertedAt: new Date().toISOString(),
    });
  } catch (error) {
    await updateHeroVideo(video.id, {
      sourceUrl,
      conversionStatus: 'failed',
      conversionError: error instanceof Error ? error.message : String(error),
    });
  } finally {
    running.delete(key);
  }
}

export function enqueueHeroVideoConversions(videos: HeroVideo[]) {
  for (const video of videos) {
    const sourceUrl = video.sourceUrl || video.url;
    if (video.type !== 'youtube' || !isYouTubeUrl(sourceUrl)) continue;
    if (video.localUrl && video.conversionStatus === 'completed') continue;
    if (video.conversionStatus === 'processing') continue;
    void convertOne(video);
  }
}

export async function retryHeroVideoConversion(videoId: string): Promise<boolean> {
  const videos = readHeroVideos(await getSettingValue('heroVideos'));
  const video = videos.find((item) => item.id === videoId);
  if (!video || video.type !== 'youtube') return false;
  await updateHeroVideo(video.id, { conversionStatus: 'pending', conversionError: '' });
  enqueueHeroVideoConversions([{ ...video, conversionStatus: 'pending', conversionError: '' }]);
  return true;
}

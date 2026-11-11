import { describe, expect, it } from 'vitest';
import { studyKind, studySource, youtubeId } from '@/lib/study-links';

describe('study material links', () => {
  it('finds the video id in every common YouTube link shape', () => {
    for (const url of [
      'https://youtu.be/L48uKyFLrMs',
      'https://youtu.be/L48uKyFLrMs?si=abc123&t=42',
      'https://www.youtube.com/watch?v=L48uKyFLrMs',
      'https://m.youtube.com/watch?feature=share&v=L48uKyFLrMs',
      'https://www.youtube.com/embed/L48uKyFLrMs',
      'https://www.youtube.com/shorts/L48uKyFLrMs',
      'https://www.youtube.com/live/L48uKyFLrMs?feature=share',
    ]) {
      expect(youtubeId(url), url).toBe('L48uKyFLrMs');
      expect(studyKind(url)).toBe('video');
      expect(studySource(url)).toBe('YouTube');
    }
  });

  it('does not mistake other links for videos', () => {
    for (const url of [
      'https://drive.google.com/file/d/1Zhy7-6FKnXk5IcmcBIZtyK_XNaZqWuXo/view?usp=sharing',
      'https://www.youtube.com/@somechannel',
      'https://www.youtube.com/watch?v=short',
      'https://notyoutube.com/watch?v=L48uKyFLrMs',
      'https://youtu.be.evil.example/L48uKyFLrMs',
      'not a link',
    ]) {
      expect(youtubeId(url), url).toBeNull();
      expect(studyKind(url)).toBe('doc');
    }
  });

  it('names where a link goes', () => {
    expect(studySource('https://drive.google.com/file/d/abc/view')).toBe('Google Drive');
    expect(studySource('https://docs.google.com/document/d/abc/edit')).toBe('Google Docs');
    expect(studySource('https://www.example.edu/notes.pdf')).toBe('example.edu');
    expect(studySource('not a link')).toBe('Link');
  });
});

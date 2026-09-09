import { describe, expect, it } from 'vitest';
import { demoSecurityCameras } from '../../client-config/profiles/orbinodo-demo/cameras';
import { visionLabCameras } from '../../client-config/profiles/vision-lab/cameras';
import { buildSecurityCameraMarker } from './security-camera-markers';

describe('renderizado seguro de fichas CCTV', () => {
  it('escapa datos operativos hostiles antes de insertarlos como HTML', () => {
    const hostile = {
      ...demoSecurityCameras[0]!,
      name: '<img src=x onerror=alert(1)>',
      responsibleArea: '<svg onload=alert(1)>',
      notes: '</textarea><script>alert(1)</script>',
    };
    const marker = buildSecurityCameraMarker(hostile, { editable: true });
    const content = String(marker.content);

    expect(content).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(content).toContain('&lt;svg onload=alert(1)&gt;');
    expect(content).toContain('&lt;/textarea&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(content).not.toContain('<script>alert(1)</script>');
    expect(content).not.toContain('<img src=x onerror=alert(1)>');
  });

  it('ofrece Robot Vision únicamente para CAM-ROBOT-01', () => {
    const robotMarker = buildSecurityCameraMarker(visionLabCameras[0]!);
    const demoMarker = buildSecurityCameraMarker(demoSecurityCameras[0]!);

    expect(String(robotMarker.content)).toContain('data-robot-vision-camera-id="camera-01"');
    expect(String(demoMarker.content)).not.toContain('data-robot-vision-camera-id');
  });
});

/**
 * CE.SDK Advanced Video Editor - Initialization Module
 *
 * This module provides the main entry point for initializing the advanced video editor.
 * Import and call `initAdvancedVideoEditor()` to configure a CE.SDK instance for advanced video editing.
 *
 * @see https://img.ly/docs/cesdk/js/getting-started/
 */

import CreativeEditorSDK from '@cesdk/cesdk-js';

import {
  DemoAssetSources,
  StickerAssetSource,
  TextAssetSource,
  TextComponentAssetSource,
  TypefaceAssetSource,
  UploadAssetSources,
  VectorShapeAssetSource
} from '@cesdk/cesdk-js/plugins';

// Configuration plugin
import { AdvancedVideoEditorConfig } from './config/plugin';

// Re-export for external use
export { AdvancedVideoEditorConfig } from './config/plugin';
export { setupBackgroundRemovalPlugin } from './plugins/background-removal';

function normalizeAssetBaseURL(baseURL: string): string {
  return baseURL.endsWith('/') ? baseURL : `${baseURL}/`;
}

/**
 * Initialize the CE.SDK Advanced Video Editor with a complete configuration.
 *
 * @param cesdk - The CreativeEditorSDK instance to configure
 */
export async function initAdvancedVideoEditor(cesdk: CreativeEditorSDK, assetBaseURL = '/assets/') {
  const normalizedAssetBaseURL = normalizeAssetBaseURL(assetBaseURL);

  // ============================================================================
  // Configuration Plugin
  // ============================================================================

  await cesdk.addPlugin(new AdvancedVideoEditorConfig());

  // ============================================================================
  // Theme and Locale
  // ============================================================================

  // cesdk.setTheme('dark');
  // cesdk.setLocale('en');

  // ============================================================================
  // Asset Source Plugins
  // ============================================================================

  await cesdk.addPlugin(
    new UploadAssetSources({
      include: [
        'ly.img.image.upload',
        'ly.img.video.upload',
        'ly.img.audio.upload'
      ]
    })
  );

  await cesdk.addPlugin(
    new DemoAssetSources({
      baseURL: normalizedAssetBaseURL,
      include: [
        'ly.img.templates.video.*',
        'ly.img.video.*'
      ]
    })
  );

  await cesdk.addPlugin(new StickerAssetSource({ baseURL: normalizedAssetBaseURL }));
  await cesdk.addPlugin(new TextAssetSource({ baseURL: normalizedAssetBaseURL }));
  await cesdk.addPlugin(new TextComponentAssetSource({ baseURL: normalizedAssetBaseURL }));
  await cesdk.addPlugin(new TypefaceAssetSource({ baseURL: normalizedAssetBaseURL }));
  await cesdk.addPlugin(new VectorShapeAssetSource({ baseURL: normalizedAssetBaseURL }));

  // ============================================================================
  // Navigation Bar Actions
  // ============================================================================

  cesdk.ui.insertOrderComponent(
    { in: 'ly.img.navigation.bar', position: 'end' },
    {
      id: 'ly.img.actions.navigationBar',
      children: [
        'ly.img.saveScene.navigationBar',
        'ly.img.exportVideo.navigationBar',
        'ly.img.exportScene.navigationBar',
        'ly.img.exportArchive.navigationBar',
        'ly.img.importScene.navigationBar',
        'ly.img.importArchive.navigationBar'
      ]
    }
  );

}

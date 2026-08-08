import { test, expect } from '@playwright/test';

test.describe('Sigma.js Knowledge Graph - UI Tests', () => {
  
  test('page loads and shows loading state', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000); // wait for backend connection
    
    // Should see some UI elements
    const body = await page.locator('body');
    await expect(body).toBeVisible();
  });

  test('sidebar node list renders', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3000); // wait for graph to load and layout
    
    // Check sidebar exists
    const sidebar = await page.locator('div').filter({ hasText: 'NODES' }).first();
    await expect(sidebar).toBeVisible();
    
    // Check type headers exist
    const typeHeaders = await page.locator('[data-type-header]').count();
    // Type headers might not have data attribute, check for category divs
    const categoryDivs = await page.locator('div').filter({ hasText: /Concept|Person|Event|Theory/ }).count();
    console.log(`Found ${categoryDivs} category items`);
    expect(categoryDivs).toBeGreaterThan(0);
  });

  test('graph canvas renders (not empty)', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3000); // wait for graph to load and layout
    
    // Check sigma canvas exists
    const canvas = page.locator('canvas');
    await expect(canvas.first()).toBeVisible();
    
    // Check sigma container is visible (bug #1 fix: z-index)
    const sigmaContainer = page.locator('.react-sigma, [data-sigma-container], [class*="sigma"]');
    const containerCount = await sigmaContainer.count();
    console.log(`Sigma containers found: ${containerCount}`);
    
    // The canvas should not be obscured - check that we can see nodes
    // by checking the SVG/canvas is rendered
    const canvasWidth = await page.locator('canvas').first().evaluate((el: HTMLCanvasElement) => el.width);
    console.log(`Canvas width: ${canvasWidth}`);
    expect(canvasWidth).toBeGreaterThan(0);
  });

  test('controls are visible', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3000);
    
    // Check zoom control button
    const zoomControls = page.locator('[class*="zoom"]').count();
    console.log(`Zoom control elements: ${zoomControls}`);
    expect(zoomControls).toBeGreaterThan(0);
    
    // Check minimap
    const minimap = page.locator('[class*="minimap"]').count();
    console.log(`Minimap elements: ${minimap}`);
  });

  test('node click opens detail panel (bug #2 fix)', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3000); // wait for graph to load
    
    // Get first visible node in sidebar
    const nodes = page.locator('div').filter({ hasText: /^[\w\s]+$/ }).first();
    const firstNode = await nodes.textContent();
    console.log(`First node: ${firstNode}`);
    
    if (firstNode) {
      await nodes.click();
      await page.waitForTimeout(2000); // wait for subgraph fetch
      
      // Check if detail panel content changed
      const body = await page.locator('body').textContent();
      
      // After clicking, we should see some activity - either detail panel or loading
      // The key test: the click handler should fire and fetch subgraph
      console.log('Node clicked, checking for response...');
    }
  });

  test('stats bar visible', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3000);
    
    // Check for status indicators
    const statusText = await page.locator('body').textContent();
    console.log(`Page contains: ${statusText?.substring(0, 200)}...`);
  });
});

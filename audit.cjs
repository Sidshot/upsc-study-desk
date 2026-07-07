const { _electron: electron } = require('playwright');
const fs = require('fs');
const path = require('path');

const REPORT_PATH = path.join(__dirname, 'electron_audit_report.md');

// Configuration
const BLOCKLIST_KEYWORDS = /delete|remove|clear|reset|disconnect|unlink|cancel|close/i;
const BLOCKLIST_SELECTORS = [
    '.text-error', 
    '[class*="delete"]', 
    '[class*="remove"]',
    '.bg-red-500' // some buttons with red bg are usually dangerous
];

const ALLOWED_TAGS = ['A', 'BUTTON'];

async function runAudit() {
    let reportContent = '# Electron GUI Audit Report\n\n## Execution Log\n\n';
    
    function logAction(msg) {
        console.log(msg);
        reportContent += `- ${msg}\n`;
    }

    try {
        logAction('Launching Electron app via Playwright...');
        // Launch Electron app
        const electronApp = await electron.launch({ args: ['.'] });
        
        // Wait for the first window
        const window = await electronApp.firstWindow();
        logAction('First window loaded.');

        // Catch console logs and errors
        window.on('console', msg => {
            if (msg.type() === 'error') {
                logAction(`**CONSOLE ERROR:** ${msg.text()}`);
            }
        });
        window.on('pageerror', exception => {
            logAction(`**PAGE ERROR:** ${exception}`);
        });

        // Wait for the UI to render (Server needs to be up, so wait a bit)
        logAction('Waiting for app network idle or initial load...');
        await window.waitForLoadState('domcontentloaded');
        await window.waitForTimeout(5000); // Give React time to render

        logAction('Starting UI traversal...');
        
        // We will just do a simple sequential crawl of elements available at the moment.
        // Doing a deep recursive crawl is complex, so we will scan current interactables,
        // click them, and then handle inputs.
        
        const locators = window.locator('a, button, [role="button"]');
        const count = await locators.count();
        logAction(`Found ${count} clickable elements on the initial page.`);

        for (let i = 0; i < count; i++) {
            const el = locators.nth(i);
            if (!await el.isVisible().catch(() => false)) continue;

            const text = (await el.textContent() || '').trim();
            const className = (await el.getAttribute('class') || '');
            
            // Safety Checks
            let isDangerous = false;
            if (BLOCKLIST_KEYWORDS.test(text) || BLOCKLIST_KEYWORDS.test(className)) {
                isDangerous = true;
            }
            for (const selector of BLOCKLIST_SELECTORS) {
                if (await el.evaluate((node, sel) => node.matches && node.matches(sel), selector).catch(() => false)) {
                    isDangerous = true;
                    break;
                }
            }

            if (isDangerous) {
                logAction(`Skipped dangerous element: [${text.substring(0, 30)}] (Class: ${className})`);
                continue;
            }

            logAction(`Clicking element: [${text.substring(0, 30) || 'no-text'}]`);
            try {
                // Check if it's actually interactable
                if (await el.isEnabled()) {
                    await el.click({ timeout: 2000, delay: 500 });
                    await window.waitForTimeout(1000); // Wait for potential UI changes
                }
            } catch (err) {
                logAction(`*Failed to click element:* ${err.message}`);
            }

            // After clicking, check for new inputs (like a modal opening)
            const inputs = window.locator('input[type="text"], textarea');
            const inputCount = await inputs.count();
            if (inputCount > 0) {
                for (let j = 0; j < inputCount; j++) {
                    const inputEl = inputs.nth(j);
                    if (await inputEl.isVisible().catch(() => false)) {
                        const placeholder = await inputEl.getAttribute('placeholder') || '';
                        logAction(`Found input field: "${placeholder}". Filling with dummy data.`);
                        await inputEl.fill('Test Audit Data').catch(e => {});
                    }
                }
                
                // If there's a submit button in the modal/form, click it
                // We'll just look for a button containing "Import" or "Save" or "Submit"
                const submitBtn = window.locator('button:has-text("Import"), button:has-text("Save"), button:has-text("Submit")').first();
                if (await submitBtn.isVisible().catch(() => false)) {
                    logAction('Submitting form with dummy data...');
                    await submitBtn.click({ timeout: 2000 });
                    await window.waitForTimeout(2000); // Wait for save
                }
            }
        }

        logAction('Traversal complete.');
        
        await electronApp.close();
        logAction('App closed gracefully.');

    } catch (e) {
        logAction(`**CRITICAL ERROR during execution:** ${e.stack || e.message}`);
    } finally {
        fs.writeFileSync(REPORT_PATH, reportContent);
        console.log(`\nAudit complete. Report written to ${REPORT_PATH}`);
    }
}

runAudit();

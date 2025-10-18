import { expect, test } from "@playwright/test";

const ADMIN_CODE = "owner-AAAA1111";
const SELLER_CODE = "sell-HQ-BBBB2222";

function uniqueSuffix() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

test.describe("smoke flow", () => {
  test("venta, cierre, pago y caja", async ({ page, browser }) => {
    const suffix = uniqueSuffix();
    const marketName = `Mercado Smoke ${suffix}`;
    const optionWinner = `Opcion ${suffix}`;
    const optionRunner = `Opcion ${suffix} B`;
    const alias = `ALIAS${suffix}`;
    const ticketAmount = 1500;
    const initialCash = 5000;
    const expectedPayout = ticketAmount * 2;
    const declaredCash = initialCash + ticketAmount - expectedPayout;

    // Admin creates market
    await page.goto("/access");
    await page.getByLabel(/AccessCode/i).fill(ADMIN_CODE);
    await page.getByRole("button", { name: /Ingresar/i }).click();
    await page.waitForURL(/dashboard/);

    await page.getByRole("link", { name: "Mercados" }).click();
    await expect(page.getByRole("heading", { name: /Mercados/i })).toBeVisible();

    await page.fill("#market-name", marketName);
    await page.fill("#market-description", "Mercado generado por prueba e2e");

    const optionInputs = page.getByPlaceholder("Nombre");
    await optionInputs.nth(0).fill(optionWinner);
    await optionInputs.nth(1).fill(optionRunner);

    await page.getByRole("button", { name: "Crear mercado" }).click();
    await expect(page.getByText(/Mercado creado/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: marketName })).toBeVisible();

    // Admin logout
    await page.getByRole("button", { name: "Salir" }).click();
    await page.waitForURL(/access/);

    // Seller opens cash and sells ticket
    await page.getByLabel(/AccessCode/i).fill(SELLER_CODE);
    await page.getByRole("button", { name: /Ingresar/i }).click();
    await page.waitForURL(/dashboard/);

    await page.getByRole("link", { name: "Caja" }).click();
    await expect(page.getByRole("heading", { name: /Mi caja/i })).toBeVisible();
    await page.fill("#saldo-inicial", String(initialCash));
    await page.getByRole("button", { name: "Abrir caja" }).click();
    await expect(page.getByText(/Caja abierta/i)).toBeVisible();

    await page.getByRole("link", { name: "Ventas" }).click();
    await expect(page.getByRole("heading", { name: /Registrar ticket/i })).toBeVisible();
    await page.selectOption("#market", { label: marketName });
    await page.selectOption("#option", { label: optionWinner });
    await page.fill("#alias", alias);
    await page.fill("#amount", String(ticketAmount));
    await page.getByRole("button", { name: "Registrar ticket" }).click();

    const successMessage = page.getByText(/Ticket registrado/i);
    await expect(successMessage).toBeVisible();
    const messageText = (await successMessage.textContent()) ?? "";
    const ticketCodeMatch = messageText.match(/Codigo:\s*(BB-[A-Z0-9-]+)/i);
    expect(ticketCodeMatch, "ticket code should be present").not.toBeNull();
    const ticketCode = ticketCodeMatch![1];

    // Close market as admin in parallel context
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await adminPage.goto("/access");
    await adminPage.getByLabel(/AccessCode/i).fill(ADMIN_CODE);
    await adminPage.getByRole("button", { name: /Ingresar/i }).click();
    await adminPage.waitForURL(/dashboard/);

    await adminPage.getByRole("link", { name: "Mercados" }).click();
    const marketCard = adminPage.locator("div", {
      has: adminPage.getByRole("heading", { name: marketName }),
    }).first();
    await expect(marketCard).toBeVisible();
    await marketCard.getByRole("combobox").selectOption({ label: optionWinner });
    await marketCard.getByRole("button", { name: "Cerrar" }).click();
    await expect(marketCard.getByText(/Estado: CERRADO/i)).toBeVisible();

    await adminPage.getByRole("button", { name: "Salir" }).click();
    await adminContext.close();

    // Seller pays ticket
    await page.getByRole("link", { name: "Pagos" }).click();
    const ticketCard = page.locator("div", {
      has: page.locator(`text=${ticketCode}`),
      hasText: alias,
    }).first();
    await expect(ticketCard).toBeVisible();
    await ticketCard.getByRole("button", { name: "Pagar" }).click();
    await expect(page.getByText(/Ticket pagado/i)).toBeVisible();

    // Seller solicita cierre de caja
    await page.getByRole("link", { name: "Caja" }).click();
    await expect(page.getByText(/Estado:/i)).toBeVisible();
    await page.fill("#saldo-declarado", String(declaredCash));
    await page.getByRole("button", { name: "Solicitar cierre" }).click();
    await expect(page.getByText(/Cierre solicitado/i)).toBeVisible();

    // Admin aprueba cierre
    const approveContext = await browser.newContext();
    const approvePage = await approveContext.newPage();
    await approvePage.goto("/access");
    await approvePage.getByLabel(/AccessCode/i).fill(ADMIN_CODE);
    await approvePage.getByRole("button", { name: /Ingresar/i }).click();
    await approvePage.waitForURL(/dashboard/);

    await approvePage.getByRole("link", { name: "Caja" }).click();
    const pendingCard = approvePage.locator("div", {
      hasText: "Vendedor HQ",
      has: approvePage.getByRole("button", { name: "Aprobar" }),
    }).first();
    await expect(pendingCard).toBeVisible();
    await pendingCard.getByRole("button", { name: "Aprobar" }).click();
    await expect(approvePage.getByText(/Caja cerrada/i)).toBeVisible();

    await approvePage.getByRole("button", { name: "Salir" }).click();
    await approveContext.close();

    // Seller ve caja cerrada
    await page.reload();
    await expect(page.getByText(/Estado: CERRADA/i)).toBeVisible();
    await page.getByRole("button", { name: "Salir" }).click();
  });
});

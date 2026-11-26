import { expect, test } from '@playwright/test';

test.describe('acceso al CRM', () => {
	test('muestra el formulario de acceso por correo en la raíz', async ({ page }) => {
		await page.goto('/');

		expect(await page.title()).toContain('Iniciar sesión');
		await expect(page.getByRole('heading', { name: 'Introduce tu correo' })).toBeVisible();
		await expect(page.getByPlaceholder('tu@correo.com')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Enviar código' })).toBeDisabled();
	});

	test('redirige la pantalla principal al login sin sesión', async ({ page }) => {
		await page.goto('/principal');
		await expect(page).toHaveURL(/\/login$/);
		await expect(page.getByRole('heading', { name: 'Introduce tu correo' })).toBeVisible();
	});
});

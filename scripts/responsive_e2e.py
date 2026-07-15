"""Playwright E2E responsivo do Publicolor PCP.

Executa as seis larguras oficiais, valida overflow, navegação horizontal do
Kanban, abertura da OS e movimento adaptado ao toque. Requer um usuário de
homologação informado por E2E_EMAIL e E2E_PASSWORD.
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

BASE_URL = os.getenv("PLAYWRIGHT_BASE_URL", "http://127.0.0.1:4173").rstrip("/")
EMAIL = os.getenv("E2E_EMAIL", "").strip()
PASSWORD = os.getenv("E2E_PASSWORD", "").strip()
ARTIFACTS = Path(os.getenv("PLAYWRIGHT_ARTIFACTS", "test-results/responsive"))

VIEWPORTS = [
    ("mobile-360", 360, 800, True),
    ("mobile-390", 390, 844, True),
    ("tablet-portrait", 768, 1024, True),
    ("tablet-landscape", 1024, 768, True),
    ("desktop-1366", 1366, 768, False),
    ("desktop-1920", 1920, 1080, False),
]


def authenticate(page: Page) -> None:
    page.goto(BASE_URL, wait_until="domcontentloaded")
    email_field = page.locator('input[type="email"]')
    if email_field.count() and email_field.first.is_visible():
        email_field.first.fill(EMAIL)
        page.locator('input[type="password"]').first.fill(PASSWORD)
        page.get_by_role("button", name=re.compile("entrar", re.I)).click()
    page.locator(".app-shell").wait_for(state="visible", timeout=30_000)


def assert_no_document_overflow(page: Page, name: str) -> None:
    dimensions = page.evaluate(
        """() => ({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
        })"""
    )
    assert dimensions["scrollWidth"] <= dimensions["clientWidth"] + 2, (
        f"{name}: overflow horizontal global: {dimensions}"
    )


def navigate(page: Page, label: re.Pattern[str]) -> bool:
    button = page.get_by_role("button", name=label).first
    if not button.count():
        return False
    if not button.is_visible():
        menu = page.locator(".mobile-menu-button")
        if menu.count() and menu.is_visible():
            menu.click()
    button.wait_for(state="visible", timeout=10_000)
    button.click()
    return True


def open_kanban(page: Page) -> None:
    assert navigate(page, re.compile(r"Produção\s*·?\s*Kanban", re.I)), "Menu Produção · Kanban não encontrado."
    page.locator(".board").wait_for(state="visible", timeout=15_000)


def test_mobile_kanban(page: Page, name: str) -> None:
    board = page.locator(".board")
    sectors = board.locator(":scope > .sector")
    count = sectors.count()
    if count < 2:
        print(f"AVISO {name}: banco de homologação possui menos de dois setores visíveis.")
        return

    before = board.evaluate("element => element.scrollLeft")
    next_button = page.locator('.kanban-sector-arrow[aria-label="Próximo setor"]')
    assert next_button.is_visible(), f"{name}: seta Próximo setor não está visível."
    next_button.click()
    page.wait_for_timeout(600)
    after = board.evaluate("element => element.scrollLeft")
    assert after > before, f"{name}: o Kanban não avançou lateralmente ({before} -> {after})."

    first_sector_width = sectors.nth(0).evaluate("element => element.getBoundingClientRect().width")
    board_width = board.evaluate("element => element.getBoundingClientRect().width")
    if page.viewport_size and page.viewport_size["width"] <= 700:
        assert abs(first_sector_width - board_width) <= 4, (
            f"{name}: setor móvel deveria ocupar uma tela ({first_sector_width} / {board_width})."
        )

    move_button = page.locator(".move-order-button").first
    if move_button.count() and move_button.is_visible():
        move_button.click()
        page.get_by_role("heading", name=re.compile("Mover OP", re.I)).wait_for(timeout=10_000)
        assert page.locator(".move-order-modal select").count() == 2, (
            f"{name}: modal Mover precisa de seletores de setor e status."
        )
        page.locator(".move-order-modal .close").click()
    else:
        print(f"AVISO {name}: não há pedido operável para validar o modal Mover.")




def test_filters_and_thumbnail(page: Page, name: str) -> None:
    filter_button = page.get_by_role("button", name=re.compile("Filtros", re.I)).first
    assert filter_button.is_visible(), f"{name}: botão Filtros não está visível."
    filter_button.click()
    page.locator(".filters-panel").wait_for(state="visible", timeout=8_000)
    page.locator('.filters-panel button[aria-label="Fechar filtros"]').click()

    first_order = page.locator(".order").first
    if not first_order.count():
        print(f"AVISO {name}: nenhum cartão para validar miniatura.")
        return
    thumbnail = first_order.locator(".order-thumbnail")
    assert thumbnail.count() == 1, f"{name}: cartão sem área de miniatura."
    image = thumbnail.locator("img")
    if image.count():
        image.wait_for(state="visible", timeout=10_000)
        loaded = image.evaluate("element => element.complete && element.naturalWidth > 0")
        assert loaded, f"{name}: imagem da miniatura não carregou."


def test_agenda_and_settings(page: Page, name: str) -> None:
    assert navigate(page, re.compile("Agenda de instalação/entrega", re.I)), f"{name}: menu Agenda não encontrado."
    page.locator(".installation-agenda").wait_for(state="visible", timeout=12_000)
    assert_no_document_overflow(page, f"{name}/agenda")

    settings = page.get_by_role("button", name=re.compile("Configurações", re.I)).first
    if not settings.count():
        print(f"AVISO {name}: usuário E2E não é administrador; Configurações não validada.")
        return
    assert navigate(page, re.compile("Configurações", re.I)), f"{name}: menu Configurações não abriu."
    page.locator(".settings-view").wait_for(state="visible", timeout=12_000)
    page.locator(".system-version-card").wait_for(state="visible", timeout=12_000)
    assert_no_document_overflow(page, f"{name}/settings")



def test_route_persistence(page: Page, name: str) -> None:
    assert navigate(page, re.compile("Atividades e Compras", re.I)), f"{name}: menu Atividades e Compras não encontrado."
    page.locator(".activities-view").wait_for(state="visible", timeout=12_000)
    assert page.url.endswith("/atividades-compras"), f"{name}: URL não foi atualizada para a página de atividades: {page.url}"
    page.reload(wait_until="domcontentloaded")
    page.locator(".activities-view").wait_for(state="visible", timeout=20_000)
    assert page.url.endswith("/atividades-compras"), f"{name}: atualização voltou para outra página: {page.url}"
    open_kanban(page)
    assert page.url.endswith("/producao"), f"{name}: URL do Kanban não foi preservada: {page.url}"

def test_order_opening(page: Page, name: str) -> None:
    order = page.locator(".order").first
    if not order.count():
        print(f"AVISO {name}: nenhum pedido ativo para validar abertura da OS.")
        return
    order.click()
    page.locator(".modal").wait_for(state="visible", timeout=10_000)
    assert_no_document_overflow(page, f"{name}/modal")
    page.locator(".modal .close").first.click()


def main() -> int:
    if not EMAIL or not PASSWORD:
        print("E2E ignorado: configure E2E_EMAIL e E2E_PASSWORD do ambiente de homologação.")
        return 0

    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    failures: list[str] = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        try:
            for name, width, height, touch in VIEWPORTS:
                context = browser.new_context(
                    viewport={"width": width, "height": height},
                    device_scale_factor=2 if touch else 1,
                    is_mobile=touch,
                    has_touch=touch,
                    locale="pt-BR",
                )
                page = context.new_page()
                try:
                    authenticate(page)
                    assert_no_document_overflow(page, name)
                    open_kanban(page)
                    assert_no_document_overflow(page, f"{name}/kanban")
                    test_filters_and_thumbnail(page, name)
                    if width <= 1100:
                        test_mobile_kanban(page, name)
                    test_order_opening(page, name)
                    test_route_persistence(page, name)
                    test_agenda_and_settings(page, name)
                    page.screenshot(path=str(ARTIFACTS / f"{name}.png"), full_page=True)
                    print(f"OK {name} ({width}x{height})")
                except Exception as error:  # noqa: BLE001
                    failures.append(f"{name}: {error}")
                    page.screenshot(path=str(ARTIFACTS / f"{name}-falha.png"), full_page=True)
                finally:
                    context.close()
        finally:
            browser.close()

    if failures:
        print("\nFALHAS RESPONSIVAS:")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print("Todas as resoluções foram validadas.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

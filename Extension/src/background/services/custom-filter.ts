/**
 * @file
 * This file is part of AdGuard Browser Extension (https://github.com/AdguardTeam/AdguardBrowserExtension).
 *
 * AdGuard Browser Extension is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * AdGuard Browser Extension is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with AdGuard Browser Extension. If not, see <http://www.gnu.org/licenses/>.
 */
import browser, { WebNavigation } from 'webextension-polyfill';

import {
    isHttpOrWsRequest,
    MAIN_FRAME_ID,
    tabsApi,
} from '@adguard/tswebextension';

import { SUBSCRIBE_OUTPUT } from '../../../../constants';
import { BACKGROUND_TAB_ID } from '../../common/constants';
import {
    MessageType,
    LoadCustomFilterInfoMessage,
    SubscribeToCustomFilterMessage,
    RemoveAntiBannerFilterMessage,
} from '../../common/messages';
import { CustomFilterApi, GetCustomFilterInfoResult } from '../api/filters/custom';
import { messageHandler } from '../message-handler';
import { Engine } from '../engine';
import type { CustomFilterMetadata } from '../schema';

/**
 * Service for processing events with custom filters.
 */
export class CustomFilterService {
    /**
     * Init handlers.
     */
    static init(): void {
        messageHandler.addListener(MessageType.LoadCustomFilterInfo, CustomFilterService.onCustomFilterInfoLoad);
        messageHandler.addListener(MessageType.SubscribeToCustomFilter, CustomFilterService.onCustomFilterSubscription);
        messageHandler.addListener(MessageType.RemoveAntiBannerFilter, CustomFilterService.onCustomFilterRemove);

        browser.webNavigation.onCommitted.addListener(CustomFilterService.injectSubscriptionScript);
    }

    /**
     * Returns custom filter info for modal window.
     *
     * @param message Message data.
     */
    static async onCustomFilterInfoLoad(message: LoadCustomFilterInfoMessage): Promise<GetCustomFilterInfoResult> {
        const { url, title } = message.data;

        return CustomFilterApi.getFilterInfo(url, title);
    }

    /**
     * Add new custom filter.
     *
     * @param message Message data.
     */
    static async onCustomFilterSubscription(message: SubscribeToCustomFilterMessage): Promise<CustomFilterMetadata> {
        const { filter } = message.data;

        const { customUrl, name, trusted } = filter;

        // Creates a filter and enables the group if necessary.
        const filterMetadata = await CustomFilterApi.createFilter({
            customUrl,
            title: name,
            trusted,
            enabled: true,
        });

        Engine.debounceUpdate();

        return filterMetadata;
    }

    /**
     * Remove custom filter.
     *
     * @param message Message data.
     */
    static async onCustomFilterRemove(message: RemoveAntiBannerFilterMessage): Promise<void> {
        const { filterId } = message.data;

        await CustomFilterApi.removeFilter(filterId);
    }

    /**
     * Inject custom filter subscription content script to tab.
     *
     * @param details OnCommitted event request details.
     */
    static async injectSubscriptionScript(details: WebNavigation.OnCommittedDetailsType): Promise<void> {
        const { tabId, frameId } = details;

        if (tabId === BACKGROUND_TAB_ID) {
            return;
        }

        const frame = tabsApi.getTabFrame(tabId, frameId);

        if (!frame) {
            return;
        }

        const isDocumentFrame = frameId === MAIN_FRAME_ID;

        if (!isDocumentFrame || !isHttpOrWsRequest(frame.url)) {
            return;
        }

        try {
            await browser.tabs.executeScript(tabId, {
                file: `/${SUBSCRIBE_OUTPUT}.js`,
                runAt: 'document_start',
                frameId,
            });
        } catch (e) {
            // do nothing
        }
    }
}

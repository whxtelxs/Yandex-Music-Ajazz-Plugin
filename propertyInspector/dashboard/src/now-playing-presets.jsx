import React, { useState } from 'react';
import { Description, Input, Label, Modal, TextField } from '@heroui/react';
import overlay from '../../now-playing/config';
import { Action, PanelCard, SelectSetting } from './controls';

const sameConfig = (left, right) => Object.keys(overlay.schema).every(key => left[key] === right[key]);

export function NowPlayingPresets({ config, presets = [], client, disabled, notify, onApply }) {
    const [selected, setSelected] = useState(null);
    const [draftName, setDraftName] = useState(null);
    const [deleting, setDeleting] = useState(null);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const matchingSaved = presets.find(item => sameConfig(config, item.config));
    const matchingBuiltIn = Object.keys(overlay.presets).find(name => sameConfig(config, overlay.preset(name)));
    const matching = matchingSaved ? 'saved:' + matchingSaved.id : matchingBuiltIn ? 'builtin:' + matchingBuiltIn : null;
    const options = Object.fromEntries([
        ...Object.entries(overlay.presets).map(([name, item]) => ['builtin:' + name, item.label]),
        ...presets.map(item => ['saved:' + item.id, item.name])
    ]);
    const current = selected && options[selected] ? selected : matching;
    const saved = presets.find(item => 'saved:' + item.id === current);
    const name = draftName ?? saved?.name ?? options[current] ?? '';
    const original = saved?.config || (current?.startsWith('builtin:') ? overlay.preset(current.slice(8)) : null);
    const modified = original && (!sameConfig(config, original) || (saved && name.trim() !== saved.name));

    function choose(key) {
        setSelected(key);
        setDraftName(null);
        setDeleteOpen(false);
        if (key.startsWith('builtin:')) onApply(overlay.preset(key.slice(8)));
        else {
            const item = presets.find(item => 'saved:' + item.id === key);
            if (item) onApply(item.config);
        }
    }

    function latestPresets() {
        return client.getSnapshot().settings.nowPlayingPresets || [];
    }

    function uniqueName(base, library) {
        let candidate = base.slice(0, 80);
        let number = 2;
        while (library.some(item => item.name.toLocaleLowerCase() === candidate.toLocaleLowerCase())) {
            const suffix = ' ' + number++;
            candidate = base.slice(0, 80 - suffix.length) + suffix;
        }
        return candidate;
    }

    function store({ duplicate = false, replace = false } = {}) {
        const library = latestPresets();
        if (!replace && library.length >= 50) {
            notify('error', 'Можно сохранить до 50 конфигов. Удалите ненужный.');
            return;
        }
        const title = duplicate ? uniqueName((name.trim() || 'Мой конфиг') + ' (копия)', library) : name.trim();
        if (!title) { notify('error', 'Введите название конфига'); return; }
        if (library.some(item => item.id !== (replace ? saved?.id : null) && item.name.toLocaleLowerCase() === title.toLocaleLowerCase())) {
            notify('error', 'Конфиг с таким названием уже есть');
            return;
        }
        const id = replace ? saved?.id : crypto.randomUUID();
        if (!id || (replace && !library.some(item => item.id === id))) return;
        const item = { id, name: title, config: overlay.sanitize(client.getSnapshot().settings.nowPlaying) };
        client.setSetting('nowPlayingPresets', replace ? library.map(entry => entry.id === id ? item : entry) : [...library, item], true,
            duplicate ? 'Конфиг «' + title + '» создан' : 'Конфиг «' + title + '» сохранён');
        setSelected('saved:' + id);
        setDraftName(null);
        setDeleteOpen(false);
    }

    function remove() {
        if (!deleting || !deleteOpen) return;
        client.setSetting('nowPlayingPresets', latestPresets().filter(item => item.id !== deleting.id), true, 'Конфиг «' + deleting.name + '» удалён');
        setSelected(null);
        setDraftName(null);
        setDeleteOpen(false);
    }

    return <PanelCard title="Конфиги" contentClassName="gap-4">
        <SelectSetting name="np-preset" label="Готовые и сохранённые варианты" value={current} options={options} placeholder="Свои настройки" onChange={choose} disabled={disabled} />
        <TextField name="np-preset-name" value={name} onChange={setDraftName} isDisabled={disabled} className="w-full min-w-0">
            <Label>Название конфига</Label>
            <Input maxLength={80} placeholder="Мой конфиг" className="w-full min-w-0" />
        </TextField>
        {modified && <Description>Есть несохранённые изменения в конфиге</Description>}
        <div className="flex flex-wrap items-center gap-3">
            {saved && <Action isDisabled={disabled || !name.trim()} onPress={() => store({ replace: true })}>Сохранить</Action>}
            <Action variant={saved ? 'tertiary' : 'secondary'} isDisabled={disabled || !name.trim() || presets.length >= 50} onPress={() => store()}>{saved ? 'Сохранить как новый' : 'Сохранить конфиг'}</Action>
            <Action variant="tertiary" isDisabled={disabled || presets.length >= 50} onPress={() => store({ duplicate: true })}>Дублировать</Action>
            {saved && <Action variant="ghost" isDisabled={disabled} onPress={() => { setDeleting({ id: saved.id, name: saved.name }); setDeleteOpen(true); }}>Удалить</Action>}
        </div>
        <Modal isOpen={deleteOpen} onOpenChange={setDeleteOpen}>
            <Modal.Backdrop variant="opaque">
                <Modal.Container placement="center" size="sm">
                    <Modal.Dialog role="alertdialog" aria-describedby="np-delete-description">
                        <Modal.Header><Modal.Heading>Удалить конфиг?</Modal.Heading></Modal.Header>
                        <Modal.Body><Description id="np-delete-description">Конфиг «{deleting?.name}» будет удалён. Текущие настройки виджета останутся.</Description></Modal.Body>
                        <Modal.Footer>
                            <Action variant="tertiary" autoFocus onPress={() => setDeleteOpen(false)}>Отмена</Action>
                            <Action variant="danger-soft" isDisabled={disabled || !deleting || !deleteOpen} onPress={remove}>Удалить</Action>
                        </Modal.Footer>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    </PanelCard>;
}

import React, { useEffect, useState } from 'react';
import { Button, Card, ColorArea, ColorField, ColorPicker, ColorSlider, ColorSwatch, Description, Input, Label, ListBox, NumberField, Select, Slider, Spinner, Switch, TextField, parseColor } from '@heroui/react';

export function PanelCard({ title, description, children, className = '', contentClassName = 'gap-6' }) {
    return <Card className={'min-w-0 ' + className}>
        {title && <Card.Header><Card.Title>{title}</Card.Title>{description && <Card.Description>{description}</Card.Description>}</Card.Header>}
        <Card.Content><div className={'flex min-w-0 flex-col ' + contentClassName}>{children}</div></Card.Content>
    </Card>;
}

export function Action({ children, pending, variant = 'secondary', ...props }) {
    return <Button variant={variant} isPending={pending} {...props}>{pending && <Spinner size="sm" color="current" />}{children}</Button>;
}

export function RangeSetting({ label, description, value, min, max, unit = '', onChange, disabled, name }) {
    return <div className="flex min-w-0 flex-col gap-2">
        <Slider id={name} aria-label={label} minValue={min} maxValue={max} step={1} value={value} isDisabled={disabled}
            onChange={next => onChange(next, false)} onChangeEnd={next => onChange(next, true)}>
            <Label>{label}</Label><Slider.Output>{value}{unit}</Slider.Output>
            <Slider.Track><Slider.Fill /><Slider.Thumb /></Slider.Track>
        </Slider>
        {description && <Description>{description}</Description>}
    </div>;
}

export function ToggleSetting({ label, description, value, onChange, disabled, name, controlPosition = 'start' }) {
    if (description || controlPosition === 'end') return <div className="flex w-full min-w-0 items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 select-text flex-col">
            <Label id={name + '-label'} htmlFor={name}>{label}</Label>
            {description && <Description id={name + '-description'}>{description}</Description>}
        </div>
        <Switch id={name} name={name} aria-labelledby={name + '-label'} aria-describedby={description ? name + '-description' : undefined} isSelected={value} onChange={onChange} isDisabled={disabled} className="shrink-0">
            <Switch.Content><Switch.Control><Switch.Thumb /></Switch.Control></Switch.Content>
        </Switch>
    </div>;
    return <Switch name={name} isSelected={value} onChange={onChange} isDisabled={disabled}>
        <Switch.Content><Switch.Control><Switch.Thumb /></Switch.Control><Label>{label}</Label></Switch.Content>
    </Switch>;
}

export function SelectSetting({ label, value, options, onChange, disabled, name, placeholder }) {
    return <Select id={name} className="w-full min-w-0" name={name} aria-label={label} value={value == null ? null : String(value)} onChange={onChange} isDisabled={disabled} placeholder={placeholder}>
        <Label>{label}</Label><Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
        <Select.Popover><ListBox>{Object.entries(options).map(([key, text]) =>
            <ListBox.Item id={key} key={key} textValue={text}>{text}<ListBox.ItemIndicator /></ListBox.Item>
        )}</ListBox></Select.Popover>
    </Select>;
}

export function ColorSetting({ label, value, onChange, disabled, name }) {
    const [color, setColor] = useState(() => parseColor(value).toFormat('hsb'));
    useEffect(() => {
        setColor(current => current.toString('hex').toLowerCase() === value.toLowerCase() ? current : parseColor(value).toFormat('hsb'));
    }, [value]);
    function changeColor(next) {
        const updated = next.toFormat('hsb');
        setColor(updated);
        onChange(updated.toString('hex'), true);
    }
    return <ColorPicker value={color} onChange={changeColor}>
        <ColorPicker.Trigger isDisabled={disabled} aria-label={label} data-color={name}><ColorSwatch size="lg" /><div className="flex flex-col items-start gap-1"><Label>{label}</Label><Description>{value}</Description></div></ColorPicker.Trigger>
        <ColorPicker.Popover className="settings-color-popover">
            <ColorArea isDisabled={disabled} aria-label="Насыщенность и яркость" colorSpace="hsb" xChannel="saturation" yChannel="brightness"><ColorArea.Thumb /></ColorArea>
            <ColorSlider isDisabled={disabled} channel="hue" colorSpace="hsb" aria-label="Оттенок"><ColorSlider.Track><ColorSlider.Thumb /></ColorSlider.Track></ColorSlider>
            <ColorField aria-label="Цвет HEX" isDisabled={disabled} className="w-full min-w-0"><Label>HEX</Label><ColorField.Group variant="secondary" className="w-full min-w-0"><ColorField.Input className="w-full min-w-0" /></ColorField.Group></ColorField>
        </ColorPicker.Popover>
    </ColorPicker>;
}

export function PortSetting({ value, onChange, disabled }) {
    return <NumberField name="debugPort" value={value} minValue={1} maxValue={65535} step={1} formatOptions={{ useGrouping: false }} onChange={onChange} isDisabled={disabled} className="grid min-w-0 grid-cols-[minmax(0,1fr)_96px] items-center gap-4 sm:grid-cols-[minmax(0,1fr)_112px]">
        <div className="flex min-w-0 flex-col gap-1">
            <Label>Порт отладки</Label>
            <Description className="[overflow-wrap:anywhere]">Параметр --remote-debugging-port при запуске Яндекс Музыки</Description>
        </div>
        <NumberField.Group className="min-w-0 w-full"><NumberField.Input id="debugPort" className="min-w-0 w-full text-center tabular-nums" /></NumberField.Group>
    </NumberField>;
}

export function LinkField({ value, inputRef }) {
    return <TextField value={value} isReadOnly aria-label="Ссылка для OBS" className="w-full min-w-0"><Input ref={inputRef} id="nowPlayingLink" className="w-full min-w-0" /></TextField>;
}

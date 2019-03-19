// @flow

import StyleLayer from '../style_layer';

import assert from 'assert';
import SymbolBucket from '../../data/bucket/symbol_bucket';
import resolveTokens from '../../util/token';
import properties from './symbol_style_layer_properties';

import {
    Transitionable,
    Transitioning,
    Layout,
    PossiblyEvaluated,
    PossiblyEvaluatedPropertyValue,
    PropertyValue
} from '../properties';

import {
    isExpression,
    StyleExpression,
    ZoomConstantExpression,
    ZoomDependentExpression
} from '../../style-spec/expression';

import type {BucketParameters} from '../../data/bucket';
import type {LayoutProps, PaintProps} from './symbol_style_layer_properties';
import type EvaluationParameters from '../evaluation_parameters';
import type {LayerSpecification} from '../../style-spec/types';
import type { Feature, SourceExpression, CompositeExpression } from '../../style-spec/expression';
import Formatted from '../../style-spec/expression/types/formatted';
import FormatSectionOverride from '../../style-spec/expression/definitions/format_section_override';
import FormatExpression from '../../style-spec/expression/definitions/format';

class SymbolStyleLayer extends StyleLayer {
    _unevaluatedLayout: Layout<LayoutProps>;
    layout: PossiblyEvaluated<LayoutProps>;

    _transitionablePaint: Transitionable<PaintProps>;
    _transitioningPaint: Transitioning<PaintProps>;
    paint: PossiblyEvaluated<PaintProps>;

    constructor(layer: LayerSpecification) {
        super(layer, properties);
    }

    recalculate(parameters: EvaluationParameters) {
        super.recalculate(parameters);

        if (this.layout.get('icon-rotation-alignment') === 'auto') {
            if (this.layout.get('symbol-placement') !== 'point') {
                this.layout._values['icon-rotation-alignment'] = 'map';
            } else {
                this.layout._values['icon-rotation-alignment'] = 'viewport';
            }
        }

        if (this.layout.get('text-rotation-alignment') === 'auto') {
            if (this.layout.get('symbol-placement') !== 'point') {
                this.layout._values['text-rotation-alignment'] = 'map';
            } else {
                this.layout._values['text-rotation-alignment'] = 'viewport';
            }
        }

        // If unspecified, `*-pitch-alignment` inherits `*-rotation-alignment`
        if (this.layout.get('text-pitch-alignment') === 'auto') {
            this.layout._values['text-pitch-alignment'] = this.layout.get('text-rotation-alignment');
        }
        if (this.layout.get('icon-pitch-alignment') === 'auto') {
            this.layout._values['icon-pitch-alignment'] = this.layout.get('icon-rotation-alignment');
        }
    }

    getValueAndResolveTokens(name: *, feature: Feature) {
        const value = this.layout.get(name).evaluate(feature, {});
        const unevaluated = this._unevaluatedLayout._values[name];
        if (!unevaluated.isDataDriven() && !isExpression(unevaluated.value)) {
            return resolveTokens(feature.properties, value);
        }

        return value;
    }

    createBucket(parameters: BucketParameters<*>) {
        return new SymbolBucket(parameters);
    }

    queryRadius(): number {
        return 0;
    }

    queryIntersectsFeature(): boolean {
        assert(false); // Should take a different path in FeatureIndex
        return false;
    }

    setPaintOverrides(layout: PossiblyEvaluated<LayoutProps>) {
        for (const overridable of properties.paint.overridableProperties) {
            if (!SymbolStyleLayer.hasPaintOverride(layout, overridable)) {
                continue;
            }
            const overriden = this.paint.get(overridable);
            const override = new FormatSectionOverride(overriden);
            const styleExpression = new StyleExpression(override, overriden.property.specification);
            let expression = null;
            if (overriden.value.kind === 'constant' || overriden.value.kind === 'source') {
                expression = (new ZoomConstantExpression('source', styleExpression): SourceExpression);
            } else {
                expression = (new ZoomDependentExpression('composite',
                                                          styleExpression,
                                                          overriden.value.zoomStops,
                                                          overriden.value._interpolationType): CompositeExpression);
            }
            this.paint._values[overridable] = new PossiblyEvaluatedPropertyValue(overriden.property,
                                                                                 expression,
                                                                                 overriden.parameters);
        }
    }

    _handleOverridablePaintPropertyUpdate<T, R>(name: string, oldValue: PropertyValue<T, R>, newValue: PropertyValue<T, R>): boolean {
        if (!this.layout || oldValue.isDataDriven() || newValue.isDataDriven()) {
            return false;
        }
        return SymbolStyleLayer.hasPaintOverride(this.layout, name);
    }

    static hasPaintOverride(layout: PossiblyEvaluated<LayoutProps>, propertyName: string): boolean {
        const textField = layout.get('text-field');
        let sections: any = [];
        if (textField.value.kind === 'constant' && textField.value.value instanceof Formatted) {
            sections = textField.value.value.sections;
        } else if (textField.value.kind === 'source') {
            const expr: ZoomConstantExpression<'source'> = ((textField.value): any);
            if (expr._styleExpression && expr._styleExpression.expression instanceof FormatExpression) {
                sections = expr._styleExpression.expression.sections;
            }
        }

        const property = properties.paint.properties[propertyName];
        for (const section of sections) {
            if (property.overrides && property.overrides.hasOverride(section)) {
                return true;
            }
        }
        return false;
    }

    static hasPaintOverrides(layout: PossiblyEvaluated<LayoutProps>): boolean {
        for (const overridable of properties.paint.overridableProperties) {
            if (SymbolStyleLayer.hasPaintOverride(layout, overridable)) {
                return true;
            }
        }
        return false;
    }
}

export default SymbolStyleLayer;

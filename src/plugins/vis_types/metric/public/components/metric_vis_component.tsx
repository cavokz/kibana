/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { last, findIndex, isNaN } from 'lodash';
import React, { Component } from 'react';
import { isColorDark } from '@elastic/eui';
import { MetricVisValue } from './metric_vis_value';
import { Input } from '../metric_vis_fn';
import type { FieldFormatsContentType, IFieldFormat } from '../../../../field_formats/common';
import { Datatable } from '../../../../expressions/public';
import { getHeatmapColors } from '../../../../charts/public';
import { VisParams, MetricVisMetric } from '../types';
import { getFormatService } from '../services';
import { SchemaConfig } from '../../../../visualizations/public';
import { Range } from '../../../../expressions/public';

import './metric_vis.scss';

export interface MetricVisComponentProps {
  visParams: Pick<VisParams, 'metric' | 'dimensions'>;
  visData: Input;
  fireEvent: (event: any) => void;
  renderComplete: () => void;
}

class MetricVisComponent extends Component<MetricVisComponentProps> {
  private getLabels() {
    const config = this.props.visParams.metric;
    const isPercentageMode = config.percentageMode;
    const colorsRange = config.colorsRange;
    const max = (last(colorsRange) as Range).to;
    const labels: string[] = [];

    colorsRange.forEach((range: any) => {
      const from = isPercentageMode ? Math.round((100 * range.from) / max) : range.from;
      const to = isPercentageMode ? Math.round((100 * range.to) / max) : range.to;
      labels.push(`${from} - ${to}`);
    });
    return labels;
  }

  private getColors() {
    const config = this.props.visParams.metric;
    const invertColors = config.invertColors;
    const colorSchema = config.colorSchema;
    const colorsRange = config.colorsRange;
    const labels = this.getLabels();
    const colors: any = {};
    for (let i = 0; i < labels.length; i += 1) {
      const divider = Math.max(colorsRange.length - 1, 1);
      const val = invertColors ? 1 - i / divider : i / divider;
      colors[labels[i]] = getHeatmapColors(val, colorSchema);
    }
    return colors;
  }

  private getBucket(val: number) {
    const config = this.props.visParams.metric;
    let bucket = findIndex(config.colorsRange, (range: any) => {
      return range.from <= val && range.to > val;
    });

    if (bucket === -1) {
      if (val < config.colorsRange[0].from) bucket = 0;
      else bucket = config.colorsRange.length - 1;
    }

    return bucket;
  }

  private getColor(val: number, labels: string[], colors: { [label: string]: string }) {
    const bucket = this.getBucket(val);
    const label = labels[bucket];
    return colors[label];
  }

  private needsLightText(bgColor: string) {
    const colors = /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/.exec(bgColor);
    if (!colors) {
      return false;
    }

    const [red, green, blue] = colors.slice(1).map((c) => parseInt(c, 10));
    return isColorDark(red, green, blue);
  }

  private getFormattedValue = (
    fieldFormatter: IFieldFormat,
    value: any,
    format: FieldFormatsContentType = 'text'
  ) => {
    if (isNaN(value)) return '-';
    return fieldFormatter.convert(value, format);
  };

  private processTableGroups(table: Datatable) {
    const config = this.props.visParams.metric;
    const dimensions = this.props.visParams.dimensions;
    const isPercentageMode = config.percentageMode;
    const min = config.colorsRange[0].from;
    const max = (last(config.colorsRange) as Range).to;
    const colors = this.getColors();
    const labels = this.getLabels();
    const metrics: MetricVisMetric[] = [];

    let bucketColumnId: string;
    let bucketFormatter: IFieldFormat;

    if (dimensions.bucket) {
      bucketColumnId = table.columns[dimensions.bucket.accessor].id;
      bucketFormatter = getFormatService().deserialize(dimensions.bucket.format);
    }

    dimensions.metrics.forEach((metric: SchemaConfig) => {
      const columnIndex = metric.accessor;
      const column = table?.columns[columnIndex];
      const formatter = getFormatService().deserialize(metric.format);
      table.rows.forEach((row, rowIndex) => {
        let title = column.name;
        let value: any = row[column.id];
        const color = this.getColor(value, labels, colors);

        if (isPercentageMode) {
          value = (value - min) / (max - min);
        }
        value = this.getFormattedValue(formatter, value, 'html');

        if (bucketColumnId) {
          const bucketValue = this.getFormattedValue(bucketFormatter, row[bucketColumnId]);
          title = `${bucketValue} - ${title}`;
        }

        const shouldColor = config.colorsRange.length > 1;

        metrics.push({
          label: title,
          value,
          color: shouldColor && config.style.labelColor ? color : undefined,
          bgColor: shouldColor && config.style.bgColor ? color : undefined,
          lightText: shouldColor && config.style.bgColor && this.needsLightText(color),
          rowIndex,
        });
      });
    });

    return metrics;
  }

  private filterBucket = (metric: MetricVisMetric) => {
    const dimensions = this.props.visParams.dimensions;
    if (!dimensions.bucket) {
      return;
    }
    const table = this.props.visData;
    this.props.fireEvent({
      name: 'filterBucket',
      data: {
        data: [
          {
            table,
            column: dimensions.bucket.accessor,
            row: metric.rowIndex,
          },
        ],
      },
    });
  };

  private renderMetric = (metric: MetricVisMetric, index: number) => {
    return (
      <MetricVisValue
        key={index}
        metric={metric}
        fontSize={this.props.visParams.metric.style.fontSize}
        onFilter={this.props.visParams.dimensions.bucket ? this.filterBucket : undefined}
        showLabel={this.props.visParams.metric.labels.show}
      />
    );
  };

  componentDidMount() {
    this.props.renderComplete();
  }

  componentDidUpdate() {
    this.props.renderComplete();
  }

  render() {
    let metricsHtml;
    if (this.props.visData) {
      const metrics = this.processTableGroups(this.props.visData);
      metricsHtml = metrics.map(this.renderMetric);
    }
    return metricsHtml;
  }
}

// default export required for React.Lazy
// eslint-disable-next-line import/no-default-export
export { MetricVisComponent as default };

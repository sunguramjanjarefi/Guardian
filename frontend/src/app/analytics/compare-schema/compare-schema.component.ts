import { Component, EventEmitter, Input, OnInit, Output, SimpleChanges } from '@angular/core';

@Component({
    selector: 'app-compare-schema',
    templateUrl: './compare-schema.component.html',
    styleUrls: ['./compare-schema.component.css']
})
export class CompareSchemaComponent implements OnInit {
    @Input('value') value!: any;

    panelOpenState = true;

    schema1: any;
    schema2: any;
    report!: any[];
    total!: any;

    @Input() type: string = 'tree';
    @Input() idLvl: string = '1';

    @Output() change = new EventEmitter<any>();

    displayedColumns: string[] = [];
    columns: any[] = [];

    type1 = true;
    type2 = true;
    type3 = true;
    type4 = true;

    constructor() {
    }

    ngOnInit() {

    }

    ngOnChanges(changes: SimpleChanges): void {
        if (this.value) {
            this.onInit();
        }
    }

    onInit() {
        this.total = this.value.total;
        this.schema1 = this.value.left;
        this.schema2 = this.value.right;

        const fields = this.value.fields;
        this.report = fields?.report;
        this.columns = fields?.columns || [];
        this.displayedColumns = this.columns
            .filter(c => c.label)
            .map(c => c.name);

        this.onRender();
    }

    onRender() {
    }

    onApply() {
        this.change.emit({
            type: 'params',
            idLvl: this.idLvl,
        })
    }
}
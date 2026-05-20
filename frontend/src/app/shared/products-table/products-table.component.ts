import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, Input, ViewChild } from '@angular/core';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';

import { Product } from '../../core/models/product.models';

@Component({
  selector: 'app-products-table',
  imports: [CommonModule, MatTableModule, MatSortModule, MatPaginatorModule, MatTooltipModule],
  templateUrl: './products-table.component.html',
  styleUrl: './products-table.component.scss',
})
export class ProductsTableComponent implements AfterViewInit {
  private readonly data = new MatTableDataSource<Product>([]);

  @ViewChild(MatSort) private sort?: MatSort;
  @ViewChild(MatPaginator) private paginator?: MatPaginator;

  @Input() set products(products: Product[]) {
    this.data.data = products || [];

    if (this.paginator) {
      this.paginator.firstPage();
    }
  }

  @Input() emptyText = 'No products found.';

  readonly columns = ['product', 'links', 'numbers', 'status', 'listing', 'created'];
  readonly pageSizeOptions = [10, 25, 50];

  get dataSource(): MatTableDataSource<Product> {
    return this.data;
  }

  ngAfterViewInit(): void {
    this.data.sortingDataAccessor = (product, property) => {
      switch (property) {
        case 'product':
          return `${product.title || ''} ${product.asin || ''}`.trim().toLowerCase();
        case 'numbers':
          return product.profit;
        case 'status':
          return product.status;
        case 'listing':
          return `${product.accountName || ''} ${product.listedByName || product.assignedListerName || ''} ${product.listedAt || ''}`
            .trim()
            .toLowerCase();
        case 'created':
          return new Date(product.createdAt).getTime();
        default:
          return '';
      }
    };

    if (this.sort) {
      this.data.sort = this.sort;
    }

    if (this.paginator) {
      this.data.paginator = this.paginator;
    }
  }
}

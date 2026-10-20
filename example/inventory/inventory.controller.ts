import { Controller } from '@nestjs/common'
import { MessagePattern, Payload } from '@nestjs/microservices'

import { RESERVE_STOCK, type ReserveStock, type ReserveStockResult } from './inventory.contract.js'
import { InventoryService } from './inventory.service.js'

@Controller()
export class InventoryController {
  private readonly inventory: InventoryService

  public constructor(inventory: InventoryService) {
    this.inventory = inventory
  }

  @MessagePattern(RESERVE_STOCK)
  public reserveStock(@Payload() { product, quantity }: ReserveStock): ReserveStockResult {
    return { reserved: this.inventory.reserve(product, quantity) }
  }
}

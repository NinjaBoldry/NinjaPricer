// Repository contract:
// - Repositories are thin Prisma wrappers. They do not validate business rules.
// - All methods accept plain typed arguments and return Prisma model types or plain objects.
// - Repositories throw Prisma errors directly; services catch and re-throw as typed errors.
// - Services (not repositories) handle transactions when multiple repos must be called together.

// Repositories are imported here as they are created in Phases 2.2–2.5.
export { ProductRepository } from './product';
export { RailRepository } from './rail';
export { VendorRateRepository } from './vendorRate';
export { BaseUsageRepository } from './baseUsage';
export { OtherVariableRepository } from './otherVariable';
export { PersonaRepository } from './persona';
export { ProductFixedCostRepository } from './productFixedCost';
export { ProductScaleRepository } from './productScale';
export { ListPriceRepository } from './listPrice';
export { VolumeDiscountTierRepository } from './volumeDiscountTier';
export { ContractLengthModifierRepository } from './contractLengthModifier';
export { LaborSKURepository } from './laborSku';
export { DepartmentRepository } from './department';
export { EmployeeRepository } from './employee';
export { BurdenRepository } from './burden';
export { CommissionRuleRepository } from './commissionRule';
export { CommissionTierRepository } from './commissionTier';
export { BundleRepository } from './bundle';
export { BundleItemRepository } from './bundleItem';
export { UserRepository } from './user';

import { ethereum } from '@graphprotocol/graph-ts';
import {
  BORROW_MODE_STABLE,
  BORROW_MODE_VARIABLE,
  getBorrowRateMode,
} from '../utils/converters';
import {
  Borrow,
  Deposit,
  FlashLoan,
  LiquidationCall,
  RebalanceStableBorrowRate,
  Paused,
  Unpaused,
  Withdraw,
  Repay,
  ReserveUsedAsCollateralDisabled,
  ReserveUsedAsCollateralEnabled,
  Swap,
  ReserveDataUpdated,
} from '../../generated/templates/LendingPool/LendingPool';
import {
  getOrInitPriceOracle,
  getOrInitReferrer,
  getOrInitReserve, getOrInitReserveParamsHistoryItem,
  getOrInitUser,
  getOrInitUserReserve, getPriceOracleAsset,
} from '../helpers/initializers';
import {
  Borrow as BorrowAction,
  Deposit as DepositAction,
  FlashLoan as FlashLoanAction,
  LiquidationCall as LiquidationCallAction,
  OriginationFeeLiquidation as OriginationFeeLiquidationAction,
  RebalanceStableBorrowRate as RebalanceStableBorrowRateAction,
  RedeemUnderlying as RedeemUnderlyingAction,
  Repay as RepayAction,
  Reserve,
  Swap as SwapAction,
  UsageAsCollateral as UsageAsCollateralAction,
} from '../../generated/schema';
import { EventTypeRef, getHistoryId } from '../utils/id-generation';

export function handleDeposit(event: Deposit): void {
  let poolReserve = getOrInitReserve(event.params.reserve, event);
  let userReserve = getOrInitUserReserve(event.params.user, event.params.reserve, event);
  let depositedAmount = event.params.amount;

  let id = getHistoryId(event, EventTypeRef.Deposit);
  if (DepositAction.load(id)) {
    id = id + '0';
  }

  let deposit = new DepositAction(id);
  deposit.pool = poolReserve.pool;
  deposit.user = userReserve.user;
  deposit.onBehalfOf = event.params.onBehalfOf.toHexString();
  deposit.userReserve = userReserve.id;
  deposit.reserve = poolReserve.id;
  deposit.amount = depositedAmount;
  deposit.timestamp = event.block.timestamp.toI32();
  if (event.params.referral) {
    let referrer = getOrInitReferrer(event.params.referral);
    deposit.referrer = referrer.id;
  }
  deposit.save();
}

export function handleWithdraw(event: Withdraw): void {
  let poolReserve = getOrInitReserve(event.params.reserve, event);
  let userReserve = getOrInitUserReserve(event.params.user, event.params.reserve, event);
  let redeemedAmount = event.params.amount;

  let redeemUnderlying = new RedeemUnderlyingAction(getHistoryId(event, EventTypeRef.Redeem));
  redeemUnderlying.pool = poolReserve.pool;
  redeemUnderlying.user = userReserve.user;
  redeemUnderlying.onBehalfOf = event.params.to.toHexString();
  redeemUnderlying.userReserve = userReserve.id;
  redeemUnderlying.reserve = poolReserve.id;
  redeemUnderlying.amount = redeemedAmount;
  redeemUnderlying.timestamp = event.block.timestamp.toI32();
  redeemUnderlying.save();
}

export function handleBorrow(event: Borrow): void {
  let userReserve = getOrInitUserReserve(event.params.user, event.params.reserve, event);
  let poolReserve = getOrInitReserve(event.params.reserve, event);

  let borrow = new BorrowAction(getHistoryId(event, EventTypeRef.Borrow));
  borrow.pool = poolReserve.pool;
  borrow.user = event.params.user.toHexString();
  borrow.onBehalfOf = event.params.onBehalfOf.toHexString();
  borrow.userReserve = userReserve.id;
  borrow.reserve = poolReserve.id;
  borrow.amount = event.params.amount;
  borrow.stableTokenDebt = userReserve.principalStableDebt; // TODO: why it make sense ?
  borrow.variableTokenDebt = userReserve.scaledVariableDebt; // TODO: why it make sense ?
  borrow.borrowRate = event.params.borrowRate;
  borrow.borrowRateMode = getBorrowRateMode(event.params.borrowRateMode);
  borrow.timestamp = event.block.timestamp.toI32();
  if (event.params.referral) {
    let referrer = getOrInitReferrer(event.params.referral);
    borrow.referrer = referrer.id;
  }
  borrow.save();
}

export function handlePaused(event: Paused): void {
  let poolReserve = getOrInitReserve(event.address, event);

  poolReserve.paused = true;
  poolReserve.save();
}

export function handleUnpaused(event: Unpaused): void {
  let poolReserve = getOrInitReserve(event.address, event);

  poolReserve.paused = false;
  poolReserve.save();
}

export function handleSwap(event: Swap): void {
  let userReserve = getOrInitUserReserve(event.params.user, event.params.reserve, event);
  let poolReserve = getOrInitReserve(event.params.reserve, event);

  let swapHistoryItem = new SwapAction(getHistoryId(event, EventTypeRef.Swap));
  swapHistoryItem.pool = poolReserve.pool;
  swapHistoryItem.borrowRateModeFrom = getBorrowRateMode(event.params.rateMode);
  if (swapHistoryItem.borrowRateModeFrom === BORROW_MODE_STABLE) {
    swapHistoryItem.borrowRateModeTo = BORROW_MODE_VARIABLE;
  } else {
    swapHistoryItem.borrowRateModeTo = BORROW_MODE_STABLE;
  }

  swapHistoryItem.variableBorrowRate = poolReserve.variableBorrowRate;
  swapHistoryItem.stableBorrowRate = poolReserve.stableBorrowRate;
  swapHistoryItem.user = userReserve.user;
  swapHistoryItem.userReserve = userReserve.id;
  swapHistoryItem.reserve = poolReserve.id;
  swapHistoryItem.timestamp = event.block.timestamp.toI32();
  swapHistoryItem.save();
}

export function handleRebalanceStableBorrowRate(event: RebalanceStableBorrowRate): void {
  let userReserve = getOrInitUserReserve(event.params.user, event.params.reserve, event);
  let poolReserve = getOrInitReserve(event.params.reserve, event);

  let rebalance = new RebalanceStableBorrowRateAction(
    getHistoryId(event, EventTypeRef.RebalanceStableBorrowRate)
  );

  rebalance.userReserve = userReserve.id;
  rebalance.borrowRateFrom = userReserve.oldStableBorrowRate;
  rebalance.borrowRateTo = userReserve.stableBorrowRate;
  rebalance.pool = poolReserve.pool;
  rebalance.reserve = poolReserve.id;
  rebalance.user = event.params.user.toHexString();
  rebalance.timestamp = event.block.timestamp.toI32();
  rebalance.save();
}

export function handleRepay(event: Repay): void {
  let userReserve = getOrInitUserReserve(event.params.user, event.params.reserve, event);
  let poolReserve = getOrInitReserve(event.params.reserve, event);

  poolReserve.save();

  let repay = new RepayAction(getHistoryId(event, EventTypeRef.Repay));
  repay.pool = poolReserve.pool;
  repay.user = userReserve.user;
  repay.onBehalfOf = event.params.repayer.toHexString();
  repay.userReserve = userReserve.id;
  repay.reserve = poolReserve.id;
  repay.amount = event.params.amount;
  repay.timestamp = event.block.timestamp.toI32();
  repay.save();
}

export function handleLiquidationCall(event: LiquidationCall): void {
  let user = getOrInitUser(event.params.user);

  let collateralPoolReserve = getOrInitReserve(event.params.collateralAsset, event);
  let collateralUserReserve = getOrInitUserReserve(
    event.params.user,
    event.params.collateralAsset,
    event
  );
  let liquidatedCollateralAmount = event.params.liquidatedCollateralAmount;

  collateralPoolReserve.lifetimeLiquidated = collateralPoolReserve.lifetimeLiquidated.plus(
    liquidatedCollateralAmount
  );

  collateralPoolReserve.save();

  let principalUserReserve = getOrInitUserReserve(event.params.user, event.params.debtAsset, event);
  let principalPoolReserve = getOrInitReserve(event.params.debtAsset, event);

  principalPoolReserve.save();

  let liquidationCall = new LiquidationCallAction(
    getHistoryId(event, EventTypeRef.LiquidationCall)
  );
  liquidationCall.pool = collateralPoolReserve.pool;
  liquidationCall.user = user.id;
  liquidationCall.collateralReserve = collateralPoolReserve.id;
  liquidationCall.collateralUserReserve = collateralUserReserve.id;
  liquidationCall.collateralAmount = liquidatedCollateralAmount;
  liquidationCall.principalReserve = principalPoolReserve.id;
  liquidationCall.principalUserReserve = principalUserReserve.id;
  liquidationCall.principalAmount = event.params.debtToCover;
  liquidationCall.liquidator = event.params.liquidator;
  liquidationCall.timestamp = event.block.timestamp.toI32();
  liquidationCall.save();
}

export function handleFlashLoan(event: FlashLoan): void {
  let poolReserve = getOrInitReserve(event.params.asset, event);

  let premium = event.params.premium;

  poolReserve.availableLiquidity = poolReserve.availableLiquidity.plus(premium);

  poolReserve.lifetimeFlashLoans = poolReserve.lifetimeFlashLoans.plus(event.params.amount);
  poolReserve.lifetimeFlashloanProtocolFee = poolReserve.lifetimeFlashloanProtocolFee.plus(premium);
  poolReserve.lifetimeFeeCollected = poolReserve.lifetimeFeeCollected.plus(premium);

  poolReserve.save();

  let flashLoan = new FlashLoanAction(getHistoryId(event, EventTypeRef.FlashLoan));
  flashLoan.pool = poolReserve.pool;
  flashLoan.reserve = poolReserve.id;
  flashLoan.target = event.params.target;
  flashLoan.initiator = event.params.initiator.toHexString();
  flashLoan.totalFee = premium;
  flashLoan.amount = event.params.amount;
  flashLoan.timestamp = event.block.timestamp.toI32();
  flashLoan.save();
}

export function handleReserveUsedAsCollateralEnabled(event: ReserveUsedAsCollateralEnabled): void {
  let poolReserve = getOrInitReserve(event.params.reserve, event);
  let userReserve = getOrInitUserReserve(event.params.user, event.params.reserve, event);

  let usageAsCollateral = new UsageAsCollateralAction(
    getHistoryId(event, EventTypeRef.UsageAsCollateral)
  );
  usageAsCollateral.pool = poolReserve.pool;
  usageAsCollateral.fromState = userReserve.usageAsCollateralEnabledOnUser;
  usageAsCollateral.toState = true;
  usageAsCollateral.user = userReserve.user;
  usageAsCollateral.userReserve = userReserve.id;
  usageAsCollateral.reserve = poolReserve.id;
  usageAsCollateral.timestamp = event.block.timestamp.toI32();
  usageAsCollateral.save();

  userReserve.usageAsCollateralEnabledOnUser = true;
  userReserve.save();
}

export function handleReserveUsedAsCollateralDisabled(
  event: ReserveUsedAsCollateralDisabled
): void {
  let poolReserve = getOrInitReserve(event.params.reserve, event);
  let userReserve = getOrInitUserReserve(event.params.user, event.params.reserve, event);

  let usageAsCollateral = new UsageAsCollateralAction(
    getHistoryId(event, EventTypeRef.UsageAsCollateral)
  );
  usageAsCollateral.pool = poolReserve.pool;
  usageAsCollateral.fromState = userReserve.usageAsCollateralEnabledOnUser;
  usageAsCollateral.toState = false;
  usageAsCollateral.user = userReserve.user;
  usageAsCollateral.userReserve = userReserve.id;
  usageAsCollateral.reserve = poolReserve.id;
  usageAsCollateral.timestamp = event.block.timestamp.toI32();
  usageAsCollateral.save();

  userReserve.usageAsCollateralEnabledOnUser = false;
  userReserve.save();
}

export function handleReserveDataUpdated(event: ReserveDataUpdated): void {
  let reserve = getOrInitReserve(event.params.reserve, event);
  reserve.liquidityRate = event.params.liquidityRate;
  reserve.stableBorrowRate = event.params.stableBorrowRate;
  reserve.variableBorrowRate = event.params.variableBorrowRate;
  reserve.liquidityIndex = event.params.liquidityIndex;
  reserve.variableBorrowIndex = event.params.variableBorrowIndex;
  reserve.lastUpdateTimestamp = event.block.timestamp.toI32();

  reserve.save();
}
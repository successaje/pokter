// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * Touchstone's trade probe. Never deployed: Touchstone places this code at a
 * throwaway address inside a single eth_call (a state override), so nothing
 * is sent, signed or spent.
 *
 * It buys a little of a token for BNB on PancakeSwap v2 and sells all of it
 * back in the same call, recording what the router quoted and what actually
 * arrived at each leg. A sell that reverts after a buy that worked is a
 * honeypot; quoted against received is the real buy and sell tax. `stage`
 * says where it stopped: 0 done, 1 no pair, 2 buy reverted, 3 nothing
 * received, 4 approve failed, 5 no sell quote, 6 sell reverted.
 */
interface IRouter {
    function WETH() external pure returns (address);
    function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory);
    function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external payable;
    function swapExactTokensForETHSupportingFeeOnTransferTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external;
}

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
}

contract TradeProbe {
    receive() external payable {}

    function probe(address router, address token)
        external
        payable
        returns (uint256 buyExpected, uint256 buyReceived, uint256 sellExpected, uint256 sellReceived, uint8 stage)
    {
        IRouter r = IRouter(router);
        address weth = r.WETH();
        address[] memory buy = new address[](2);
        buy[0] = weth;
        buy[1] = token;
        try r.getAmountsOut(msg.value, buy) returns (uint256[] memory quoted) {
            buyExpected = quoted[1];
        } catch {
            return (0, 0, 0, 0, 1);
        }
        try r.swapExactETHForTokensSupportingFeeOnTransferTokens{value: msg.value}(0, buy, address(this), block.timestamp) {} catch {
            return (buyExpected, 0, 0, 0, 2);
        }
        buyReceived = IERC20(token).balanceOf(address(this));
        if (buyReceived == 0) return (buyExpected, 0, 0, 0, 3);
        // Low-level, because some tokens' approve returns nothing.
        (bool approved, ) = token.call(abi.encodeWithSelector(0x095ea7b3, router, type(uint256).max));
        if (!approved) return (buyExpected, buyReceived, 0, 0, 4);
        address[] memory sell = new address[](2);
        sell[0] = token;
        sell[1] = weth;
        try r.getAmountsOut(buyReceived, sell) returns (uint256[] memory quoted) {
            sellExpected = quoted[1];
        } catch {
            return (buyExpected, buyReceived, 0, 0, 5);
        }
        uint256 before = address(this).balance;
        try r.swapExactTokensForETHSupportingFeeOnTransferTokens(buyReceived, 0, sell, address(this), block.timestamp) {} catch {
            return (buyExpected, buyReceived, sellExpected, 0, 6);
        }
        sellReceived = address(this).balance - before;
        stage = 0;
    }
}

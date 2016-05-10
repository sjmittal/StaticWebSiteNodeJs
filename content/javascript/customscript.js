'use strict';

    <script src="lib/react/react.js"></script>
    <script src="lib/react/react-dom.js"></script>

var mountNode = document.getElementById('addProductForm');
var mountNodeList = document.getElementById('listcontainer');
var formState = null;

var ProductList = React.createClass({
    displayName: 'ProductList',

    render: function render() {
        //var createItem = function createItem(item) {
        //    return React.createElement(
        //      'li',
        //      { key: item.id },
        //      item.text
        //    );
        //};
        //return React.createElement(
        //  'ul',
        //  null,
        //  this.props.items.map(createItem)
        //);

        var createItem = function createItem(item) {
            

            return React.createElement(
              //'li',
              //{ key: item.id },
              //item.text
              'div',
                { className: 'col-md-3' },
            React.createElement(
                'a',
                { className: 'list-group-item active' },
                item.textName//'Product Name'
            ),
            React.createElement(
                'div',
                { className: 'list-group-item' },
                React.createElement(
                    'h4',
                    null,
                    'Description'
                ),
                React.createElement(
                    'p',
                    { className: 'list-group-item-text' },
                    item.itemsDescription//'This is one of the best product available in the market.'
                )
            ),
            React.createElement(
                'a',
                { className: 'list-group-item active' },
                React.createElement(
                    'span',
                    { className: 'badge' },
                    'X'
                ),
                'Price($): ' + item.itemsPrice
            )
            );
        };

        return React.createElement(
            'div',
            null,
            ''//this.item.map(createItem)
        );

    }
});

var AddProductListApp = React.createClass({
    displayName: 'ProductApp',

    getInitialState: function getInitialState() {
        return { itemsName: [], textName: '', itemsPrice: [], textPrice: '', itemsDescription: [], textDescription: '' };
    },

    // textbox OnChange Events
    onChangeName: function onChangeName(e) {
        this.setState({ textName: e.target.value });
    },
    onChangePrice: function onChangePrice(e) {
        this.setState({ textPrice: e.target.value });
    },
    onChangeDescription: function onChangeDescription(e) {
        this.setState({ textDescription: e.target.value });
    },

    onClick: function handleSubmit(e) {
        e.preventDefault();
        // Form elements state management
        //var nextItems = this.state.items.concat([{ text: this.state.text, id: Date.now() }]);
        //var nextText = '';
        //this.setState({ items: nextItems, text: nextText });

        var pName = this.state.itemsName.concat([{ text: this.state.textName, id: Date.now() + 'name' }]);
        var pPrice = this.state.itemsName.concat([{ text: this.state.textPrice, id: Date.now() + 'price' }]);
        var pDescription = this.state.itemsName.concat([{ text: this.state.textDescription, id: Date.now() + 'description' }]);

        this.setState({ itemsName: pName, textName: '', itemsPrice: pPrice, textPrice: '', itemsDescription:pDescription, textDescription:''  });
        formState = this.state;
        var productList = new ProductList();
        productList.render();
        ReactDOM.render(React.createElement(ProductList, null), mountNodeList);
    },
    render: function render() {
        return React.createElement(
            'form',
            { className: 'form-horizontal' },
            React.createElement('div', { className: 'form-group' }, React.createElement('label', { className: 'col-sm-2 control-label' }, 'Name'), React.createElement('div', { className: 'col-sm-10' }, React.createElement('input', { type: 'text', className: 'form-control', id: 'txtName', onChange: this.onChangeName, value: this.state.text }))),
            React.createElement('div', { className: 'form-group' }, React.createElement('label', { className: 'col-sm-2 control-label' }, 'Price ($)'), React.createElement('div', { className: 'col-sm-10' }, React.createElement('input', { type: 'text', className: 'form-control', id: 'txtPrice', onChange: this.onChangePrice, value: this.state.text }))),
            React.createElement('div', { className: 'form-group' }, React.createElement('label', { className: 'col-sm-2 control-label' }, 'Description'), React.createElement('div', { className: 'col-sm-10' }, React.createElement('textarea', { rows: '3', className: 'form-control', id: 'txtDescription', onChange: this.onChangeDescription, value: this.state.text }))),
            React.createElement('div', { className: 'form-group' }, React.createElement('div', { className: 'col-sm-2' }, ''), React.createElement('div', { className: 'col-sm-10' }, React.createElement('button', { className: 'btn btn-primary btn-add', onClick: this.onClick }, 'Add Product')))
        );
    }
});

ReactDOM.render(React.createElement(AddProductListApp, null), mountNode);
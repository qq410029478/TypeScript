//////////////////////////////////////////////////////////////////////////////////////
//
//  The MIT License (MIT)
//
//  Copyright (c) 2015-present, Dom Chen.
//  All rights reserved.
//
//  Permission is hereby granted, free of charge, to any person obtaining a copy of
//  this software and associated documentation files (the "Software"), to deal in the
//  Software without restriction, including without limitation the rights to use, copy,
//  modify, merge, publish, distribute, sublicense, and/or sell copies of the Software,
//  and to permit persons to whom the Software is furnished to do so, subject to the
//  following conditions:
//
//      The above copyright notice and this permission notice shall be included in all
//      copies or substantial portions of the Software.
//
//  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
//  INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
//  PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
//  HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
//  OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
//  SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
//
//////////////////////////////////////////////////////////////////////////////////////

import { addEmitHelpers, setEmitFlags, setSourceMapRange } from "../factory/emitNode";
import { factory } from "../factory/nodeFactory";
import { TransformationContext, SourceFile, Node, VisitResult, ModifierFlags, SyntaxKind, ClassDeclaration, NamespaceDeclaration, FunctionDeclaration, EnumDeclaration, ModuleBlock, ModuleBody, NodeArray, Statement, ExpressionWithTypeArguments, ClassLikeDeclaration, InterfaceDeclaration, SymbolFlags, EmitFlags, EmitHelper, Identifier, Expression, Bundle } from "../types";
import { hasSyntacticModifier, createRange, getEffectiveImplementsTypeNodes, getInterfaceBaseTypeNodes, getClassExtendsHeritageElement, getDeclarationOfKind } from "../utilities";
import { isStatement } from "../utilitiesPublic";
import { visitNodes } from "../visitorPublic";
import { chainBundle } from "./utilities";

/*@internal*/


    export function transformTypeScriptPlus(context: TransformationContext): (x: SourceFile | Bundle) => SourceFile | Bundle  {
        const {
            factory,
        } = context;

        const compilerOptions = context.getCompilerOptions();
        const typeChecker = compilerOptions.emitReflection ? context.getEmitHost().getTypeChecker() : null;

        return chainBundle(context, transformSourceFile);

        function transformSourceFile(node: SourceFile) {
            if (!compilerOptions.emitReflection) {
                return node;
            }
            let visited = factory.updateSourceFile(node, visitNodes(node.statements, visitStatement, isStatement));
            addEmitHelpers(visited, context.readEmitHelpers());
            return visited;
        }

        function visitStatement(node: Node): VisitResult<Node> {
            if (hasSyntacticModifier(node, ModifierFlags.Ambient)) {
                return node;
            }
            if (node.kind === SyntaxKind.ClassDeclaration) {
                return visitClassDeclaration(<ClassDeclaration>node);
            }
            if (node.kind === SyntaxKind.ModuleDeclaration) {
                return visitModule(<NamespaceDeclaration>node);
            }
            if (node.kind === SyntaxKind.FunctionDeclaration) {
                return visitFunctionDeclaration(<FunctionDeclaration>node);
            }
            if (node.kind === SyntaxKind.ExpressionStatement && node.original && (node.original.kind === SyntaxKind.ClassDeclaration || node.original.kind === SyntaxKind.EnumDeclaration)) {//add by:H3D_sugen
                return visitEnumDeclaration(node, <EnumDeclaration>node.original);
            }
            return node;
        }

        function visitModule(node: NamespaceDeclaration): NamespaceDeclaration {
            if (node.body.kind === SyntaxKind.ModuleDeclaration) {
                return updateModuleDeclaration(node, visitModule(<NamespaceDeclaration>node.body));
            }
            if (node.body.kind === SyntaxKind.ModuleBlock) {
                const body = updateModuleBlock(node.body, visitNodes(
                    (<ModuleBlock>node.body).statements, visitStatement, isStatement));
                return updateModuleDeclaration(node, body);
            }
            return node;
        }

        function updateModuleDeclaration(node: NamespaceDeclaration, body: ModuleBody) {
            if (node.body !== body) {
                let clonedNode = factory.cloneNode(node);
                return <NamespaceDeclaration>factory.updateModuleDeclaration(clonedNode, clonedNode.modifiers, clonedNode.name, body);
            }
            return node
        }

        function updateModuleBlock(node: ModuleBlock, statements: NodeArray<Statement>) {
            if (node.statements !== statements) {
                let clonedNode = factory.cloneNode(node);
                return factory.updateModuleBlock(clonedNode, statements);
            }
            return node;
        }

        function visitFunctionDeclaration(node: FunctionDeclaration) : VisitResult<Node> {//code by:H3D_sugen
            let fullClassName = node.name!.escapedText;
            let classStatement = factory.cloneNode(node);
            //console.log("fullClassName ",node.name.escapedText)
            //typeChecker.getFullyQualifiedName(node.name.escapedText);//code by:H3D_sugen
            let expression = createReflectHelper(context, node.name!, fullClassName.toString(), null);
            //ts.setSourceMapRange(expression, ts.createRange(node.name.pos, node.end));
            let statement = factory.createExpressionStatement(expression);
            //ts.setSourceMapRange(statement, ts.createRange(-1, node.end));
            let statements : VisitResult<Node> = [classStatement, statement];
            return statements;
        }

        function visitEnumDeclaration(expNode: Node, enumNode : EnumDeclaration) {//code by:H3D_sugen
            let fullClassName = enumNode.name.escapedText;
            let clonedExpNode = factory.cloneNode(expNode);
            let expression = createReflectHelper(context, enumNode.name, fullClassName.toString(), null);
            let statement = factory.createExpressionStatement(expression);
            let statements = [clonedExpNode, statement];
            return statements;
        }

        function visitClassDeclaration(node: ClassDeclaration): VisitResult<Statement> {
            const classStatement = factory.cloneNode(node);
            const statements: Statement[] = [classStatement];
            
            let interfaceMap: any = {};
            getImplementedInterfaces(node, interfaceMap);
            let allInterfaces: string[] = Object.keys(interfaceMap);
            let interfaces: string[];
            let superTypes = getSuperClassTypes(node);
            if (superTypes) {
                interfaces = [];
                for (let type of allInterfaces) {
                    if (superTypes.indexOf(type) === -1) {
                        interfaces.push(type);
                    }
                }
            }
            else {
                interfaces = allInterfaces;
            }
            node.typeNames = interfaces;

            let fullClassName = node.name!.escapedText;//code by:H3D_sugen
            // let fullClassName = typeChecker!.getFullyQualifiedName(node.symbol);
            const expression = createReflectHelper(context, node.name!, fullClassName.toString(), interfaces);
            setSourceMapRange(expression, createRange(node.name!.pos, node.end));

            const statement = factory.createExpressionStatement(expression);
            setSourceMapRange(statement, createRange(-1, node.end));
            statements.push(statement);

            return statements;
        }

        function getImplementedInterfaces(node: Node, result: any) {
            let superInterfaces: undefined | readonly ExpressionWithTypeArguments[] = undefined;
            if (node.kind === SyntaxKind.ClassDeclaration) {
                superInterfaces = getEffectiveImplementsTypeNodes(<ClassLikeDeclaration>node);
            }
            else {
                superInterfaces = getInterfaceBaseTypeNodes(<InterfaceDeclaration>node);
            }
            if (superInterfaces) {
                superInterfaces.forEach(superInterface => {
                    let type = typeChecker!.getTypeAtLocation(superInterface)
                    if (type && type.symbol && type.symbol.flags & SymbolFlags.Interface) {
                        let symbol = type.symbol;
                        let fullName = typeChecker!.getFullyQualifiedName(symbol);
                        result[fullName] = true;
                        const declaration = getDeclarationOfKind(symbol, SyntaxKind.InterfaceDeclaration);
                        if (declaration) {
                            getImplementedInterfaces(declaration, result);
                        }
                    }
                });
            }
        }

        function getSuperClassTypes(node: ClassLikeDeclaration): string[] | undefined {
            let superClass = getClassExtendsHeritageElement(node);
            if (!superClass) {
                return undefined;
            }
            let type = typeChecker!.getTypeAtLocation(superClass);
            if (!type || !type.symbol) {
                return undefined;
            }
            let declaration = <ClassLikeDeclaration>getDeclarationOfKind(type.symbol, SyntaxKind.ClassDeclaration);
            return declaration ? declaration.typeNames : undefined;
        }
    }

    function getHelperName(name : string) {
        return setEmitFlags(factory.createIdentifier(name), EmitFlags.HelperName | EmitFlags.AdviseOnEmitNode);
    }

    const reflectHelper: EmitHelper = {
        name: "typescript:reflect",
        scoped: false,
        priority: 0,
        text: "\nvar __reflect = (this && this.__reflect) || function (cls, name) {\n   globalThis[name] = cls\n};"
    };

    function createReflectHelper(context: TransformationContext, name: Identifier, fullClassName: string, interfaces: string[] | null) {
        context.requestEmitHelper(reflectHelper);
        let argumentsArray: Expression[] = [
            name, //createPropertyAccess(name, createIdentifier("prototype")),
            factory.createStringLiteral(fullClassName)
        ];
        if (interfaces) {
            // let elements: Expression[] = [];
            // for (let value of interfaces) {
            //     elements.push(createLiteral(value));
            // }
            // argumentsArray.push(createArrayLiteral(elements));
        }
        return factory.createCallExpression(
            getHelperName("__reflect"),
            /*typeArguments*/ undefined,
            argumentsArray
        );
    }
